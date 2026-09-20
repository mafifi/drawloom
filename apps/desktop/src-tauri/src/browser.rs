use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Camera,
    Microphone,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tab {
    pub id: String,
    pub conversation_id: String,
    pub title: String,
    pub url: String,
    pub status: String,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub id: String,
    pub tab_id: String,
    pub document_id: String,
    pub origin: String,
    pub top_origin: String,
    pub permissions: Vec<Permission>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Setting {
    pub origin: String,
    pub permission: Permission,
    pub decision: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub tabs: Vec<Tab>,
    pub requests: Vec<Request>,
    pub permissions: Vec<Setting>,
}
#[derive(Default)]
pub struct Model {
    pub tabs: Vec<Tab>,
    pub requests: Vec<Request>,
    pub permissions: Vec<Setting>,
    pub documents: BTreeMap<String, String>,
    // Ephemeral native request provenance, never persisted as browsing history.
    pub media_origins: BTreeMap<String, BTreeSet<String>>,
}
impl Model {
    pub fn remembered(&self, origin: &str, permissions: &[Permission]) -> Option<bool> {
        if permissions.iter().any(|p| {
            self.permissions
                .iter()
                .any(|s| s.origin == origin && s.permission == *p && s.decision == "block")
        }) {
            Some(false)
        } else if !permissions.is_empty()
            && permissions.iter().all(|p| {
                self.permissions
                    .iter()
                    .any(|s| s.origin == origin && s.permission == *p && s.decision == "allow")
            })
        {
            Some(true)
        } else {
            None
        }
    }
    pub fn forget(&mut self, origin: &str, permission: &Permission) -> (Vec<String>, Vec<String>) {
        self.permissions
            .retain(|s| s.origin != origin || s.permission != *permission);
        let tabs: Vec<String> = self
            .media_origins
            .iter()
            .filter(|(_, origins)| origins.contains(origin))
            .map(|(tab, _)| tab.clone())
            .chain(
                self.requests
                    .iter()
                    .filter(|r| r.origin == origin)
                    .map(|r| r.tab_id.clone()),
            )
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let mut requests = Vec::new();
        for id in &tabs {
            requests.extend(self.invalidate(id));
            self.media_origins.remove(id);
            if let Some(tab) = self.tabs.iter_mut().find(|t| &t.id == id) {
                tab.status = "unloaded".into();
                tab.can_go_back = false;
                tab.can_go_forward = false;
                tab.error = Some("Site permission reset. Reopen this page to continue.".into());
            }
        }
        (tabs, requests)
    }
    pub fn decision(&mut self, id: &str, choice: &str) -> Result<bool, String> {
        if !matches!(choice, "allow_once" | "allow" | "block" | "dismiss") {
            return Err("Invalid permission choice".into());
        }
        let index = self
            .requests
            .iter()
            .position(|r| r.id == id)
            .ok_or("Permission request expired")?;
        let request = self.requests.remove(index);
        if self.documents.get(&request.tab_id) != Some(&request.document_id) {
            return Err("Permission document changed".into());
        }
        if matches!(choice, "allow" | "block") {
            for permission in request.permissions {
                self.permissions
                    .retain(|s| s.origin != request.origin || s.permission != permission);
                self.permissions.push(Setting {
                    origin: request.origin.clone(),
                    permission,
                    decision: choice.into(),
                });
            }
        }
        self.media_origins
            .entry(request.tab_id)
            .or_default()
            .insert(request.origin);
        Ok(matches!(choice, "allow_once" | "allow"))
    }
    pub fn invalidate(&mut self, tab: &str) -> Vec<String> {
        let ids = self
            .requests
            .iter()
            .filter(|r| r.tab_id == tab)
            .map(|r| r.id.clone())
            .collect();
        self.requests.retain(|r| r.tab_id != tab);
        self.documents.insert(tab.to_owned(), unique_id("document"));
        ids
    }
}
fn restoration_url(value: &str) -> String {
    tauri::Url::parse(value)
        .ok()
        .filter(|u| {
            matches!(u.scheme(), "http" | "https")
                && u.username().is_empty()
                && u.password().is_none()
        })
        .map(|u| u.origin().ascii_serialization())
        .unwrap_or_default()
}
fn trusted_caller(label: &str, url: &tauri::Url, origin: &str) -> bool {
    label == "main" && url.origin().ascii_serialization() == origin
}
pub fn unique_id(prefix: &str) -> String {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    format!(
        "{prefix}-{:x}-{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    version: u32,
    tabs: Vec<Tab>,
    permissions: Vec<Setting>,
    store: [u8; 16],
}
pub struct Browser {
    pub origin: String,
    path: PathBuf,
    pub model: Mutex<Model>,
    pub store: [u8; 16],
    unavailable_reason: Option<String>,
}
impl Browser {
    pub fn load(origin: String, directory: PathBuf) -> Self {
        Self::new(origin.clone(), directory.clone()).unwrap_or_else(|_| Self {
            origin, path: directory.join("browser.json"), model: Mutex::new(Model::default()),
            // This disabled service cannot create a native store or save
            // defaults over the original data. Conversation startup continues.
            store: [0; 16], unavailable_reason: Some("Browser unavailable: saved browser data could not be loaded safely. Existing browser.json was preserved. Check access to the Drawloom data directory or restore browser.json from a trusted backup, then restart Drawloom.".into()),
        })
    }
    pub fn check_action(&self, action: &Action) -> Result<(), String> {
        if !matches!(action, Action::Read {}) {
            if let Some(reason) = &self.unavailable_reason {
                return Err(reason.clone());
            }
        }
        Ok(())
    }
    pub fn new(origin: String, directory: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let path = directory.join("browser.json");
        let mut bytes = [0u8; 16];
        // A stable, installation-specific WebKit store; /dev/urandom is OS native.
        use std::io::Read;
        std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut bytes))
            .map_err(|e| e.to_string())?;
        let saved = if path.exists() {
            let data = std::fs::read(&path).map_err(|e| e.to_string())?;
            serde_json::from_slice::<Saved>(&data)
                .map_err(|_| "Invalid saved browser preferences".to_string())?
        } else {
            Saved {
                version: 1,
                tabs: vec![],
                permissions: vec![],
                store: bytes,
            }
        };
        if saved.version != 1 {
            return Err("Unsupported saved browser preferences version".into());
        }
        let mut model = Model {
            tabs: saved.tabs,
            permissions: saved.permissions,
            ..Model::default()
        };
        let mut identities = std::collections::BTreeSet::new();
        for tab in &mut model.tabs {
            if !tab.id.starts_with("browser-")
                || !tab
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-')
                || !identities.insert(tab.id.clone())
                || tab.id.len() > 256
                || tab.conversation_id.is_empty()
                || tab.conversation_id.len() > 256
            {
                return Err("Invalid saved browser tab".into());
            }
            tab.url = restoration_url(&tab.url);
            if !tab.url.is_empty()
                && !crate::browser_policy::navigation_allowed(
                    &tauri::Url::parse(&tab.url).map_err(|e| e.to_string())?,
                    &origin,
                )
            {
                tab.url.clear();
            }
            tab.title = "Browser".into();
            tab.status = "unloaded".into();
            tab.can_go_back = false;
            tab.can_go_forward = false;
            tab.error = None;
        }
        for setting in &model.permissions {
            if restoration_url(&setting.origin) != setting.origin
                || setting.origin.is_empty()
                || !matches!(setting.decision.as_str(), "allow" | "block")
            {
                return Err("Invalid saved site permission".into());
            }
        }
        let browser = Self {
            origin,
            path,
            model: Mutex::new(model),
            store: saved.store,
            unavailable_reason: None,
        };
        browser.save()?;
        Ok(browser)
    }
    pub fn snapshot(&self) -> Snapshot {
        let m = self.model.lock().unwrap();
        Snapshot {
            available: cfg!(target_os = "macos") && self.unavailable_reason.is_none(),
            reason: if cfg!(target_os = "macos") {
                self.unavailable_reason.clone()
            } else {
                Some("Native browsing requires macOS 14 or later".into())
            },
            tabs: m.tabs.clone(),
            requests: m.requests.clone(),
            permissions: m.permissions.clone(),
        }
    }
    pub fn save(&self) -> Result<(), String> {
        if let Some(reason) = &self.unavailable_reason {
            return Err(reason.clone());
        }
        let m = self.model.lock().map_err(|_| "Browser state unavailable")?;
        let mut tabs = m.tabs.clone();
        for tab in &mut tabs {
            tab.url = restoration_url(&tab.url);
            tab.title = "Browser".into();
            tab.status = "unloaded".into();
            tab.can_go_back = false;
            tab.can_go_forward = false;
            tab.error = None;
        }
        let data = serde_json::to_vec(&Saved {
            version: 1,
            tabs,
            permissions: m.permissions.clone(),
            store: self.store,
        })
        .map_err(|e| e.to_string())?;
        let temp = self.path.with_extension("json.pending");
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp)
            .map_err(|e| e.to_string())?;
        file.write_all(&data)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        std::fs::rename(temp, &self.path).map_err(|e| e.to_string())
    }
}
pub fn changed(app: &tauri::AppHandle) {
    let Some(browser) = app.try_state::<Browser>() else {
        return;
    };
    let snapshot = browser.snapshot();
    if let Some(main) = app.get_webview("main") {
        let _ = main.emit_to(
            tauri::EventTarget::webview("main"),
            "drawloom-browser-changed",
            snapshot,
        );
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    Read {},
    Open {
        conversation_id: String,
    },
    Navigate {
        tab_id: String,
        url: String,
    },
    Back {
        tab_id: String,
    },
    Forward {
        tab_id: String,
    },
    Reload {
        tab_id: String,
    },
    Stop {
        tab_id: String,
    },
    Close {
        tab_id: String,
    },
    Place {
        tab_id: String,
        bounds: Bounds,
        visible: bool,
    },
    Decide {
        request_id: String,
        choice: String,
    },
    Forget {
        origin: String,
        permission: Permission,
    },
    External {
        tab_id: String,
    },
}
impl Action {
    fn operation(&self) -> &'static str {
        match self {
            Self::Read {} => "read",
            Self::Open { .. } => "open",
            Self::Navigate { .. } => "navigate",
            Self::Back { .. } => "back",
            Self::Forward { .. } => "forward",
            Self::Reload { .. } => "reload",
            Self::Stop { .. } => "stop",
            Self::Close { .. } => "close",
            Self::Place { .. } => "place",
            Self::Decide { .. } => "decide",
            Self::Forget { .. } => "forget",
            Self::External { .. } => "external",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub async fn browser_command(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    action: Action,
) -> Result<Snapshot, String> {
    // Run synchronous Tauri dispatch only on a worker. The Cocoa thread never
    // waits for a callback it must itself service.
    tauri::async_runtime::spawn_blocking(move || {
        let operation = action.operation();
        let browser = app.state::<Browser>();
        if !trusted_caller(
            webview.label(),
            &webview.url().map_err(|_| {
                eprintln!("drawloom.browser.command operation={operation} stage=caller_url outcome=failed");
                "Could not verify the browser command caller".to_owned()
            })?,
            &browser.origin,
        ) {
            eprintln!("drawloom.browser.command operation={operation} stage=caller_authority outcome=rejected");
            return Err("Browser commands require the authenticated main application".into());
        }
        browser.check_action(&action).inspect_err(|_| eprintln!("drawloom.browser.command operation={operation} stage=availability outcome=rejected"))?;
        #[cfg(target_os = "macos")]
        crate::browser_native::command(&app, action).inspect_err(|_| eprintln!("drawloom.browser.command operation={operation} stage=native_execution outcome=failed"))?;
        #[cfg(not(target_os = "macos"))]
        if !matches!(action, Action::Read {}) {
            return Err("Native browsing requires macOS 14 or later".into());
        }
        Ok(browser.snapshot())
    })
    .await
    .map_err(|_| {
        eprintln!("drawloom.browser.command stage=worker outcome=failed");
        "Native browser operation was interrupted".to_owned()
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bad_browser_data_preserves_file_and_returns_unavailable_service() {
        let unsupported = serde_json::to_vec(&Saved {
            version: 999,
            tabs: vec![],
            permissions: vec![],
            store: [1; 16],
        })
        .unwrap();
        for bytes in [b"{malformed saved browser data".to_vec(), unsupported] {
            let directory = std::env::temp_dir().join(unique_id("drawloom-browser-recovery-test"));
            std::fs::create_dir(&directory).unwrap();
            let path = directory.join("browser.json");
            std::fs::write(&path, &bytes).unwrap();
            let browser = Browser::load("http://127.0.0.1:3210".into(), directory.clone());
            let snapshot = browser.snapshot();
            let file_after_load = std::fs::read(&path).unwrap();
            std::fs::remove_file(&path).unwrap();
            std::fs::remove_dir(directory).unwrap();
            assert!(!snapshot.available);
            assert!(snapshot.reason.is_some());
            assert!(
                snapshot.tabs.is_empty()
                    && snapshot.requests.is_empty()
                    && snapshot.permissions.is_empty()
            );
            assert_eq!(file_after_load, bytes);
        }
    }
    #[test]
    fn unavailable_browser_allows_read_but_cannot_reset_settings_or_open_tabs() {
        let directory = std::env::temp_dir().join(unique_id("drawloom-browser-recovery-test"));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("browser.json");
        let original = b"not valid browser settings";
        std::fs::write(&path, original).unwrap();
        let browser = Browser::load("http://127.0.0.1:3210".into(), directory.clone());
        let read = browser.check_action(&Action::Read {});
        let open = browser.check_action(&Action::Open {
            conversation_id: "conversation-1".into(),
        });
        let save = browser.save();
        let after = std::fs::read(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(directory).unwrap();
        assert!(read.is_ok());
        assert!(open.is_err());
        assert!(save.is_err());
        assert_eq!(after, original);
    }
    fn pending() -> Model {
        let mut model = Model::default();
        model.documents.insert("tab-1".into(), "doc-1".into());
        model.requests.push(Request {
            id: "req-1".into(),
            tab_id: "tab-1".into(),
            document_id: "doc-1".into(),
            origin: "https://embedded.example".into(),
            top_origin: "https://top.example".into(),
            permissions: vec![Permission::Camera],
        });
        model
    }
    #[test]
    fn default_ask_and_grants_do_not_cross_origins_or_capabilities() {
        let mut model = pending();
        assert_eq!(
            model.remembered("https://embedded.example", &[Permission::Camera]),
            None
        );
        model.decision("req-1", "allow").unwrap();
        assert_eq!(
            model.remembered("https://embedded.example", &[Permission::Camera]),
            Some(true)
        );
        assert_eq!(
            model.remembered("https://other.example", &[Permission::Camera]),
            None
        );
        assert_eq!(
            model.remembered("https://embedded.example", &[Permission::Microphone]),
            None
        );
    }
    #[test]
    fn reset_finds_cached_grants_without_an_outstanding_prompt() {
        let mut model = pending();
        model.tabs.push(Tab {
            id: "tab-1".into(),
            conversation_id: "conversation-1".into(),
            title: "Website".into(),
            url: "https://top.example/page".into(),
            status: "ready".into(),
            can_go_back: true,
            can_go_forward: false,
            error: None,
        });
        model.decision("req-1", "allow").unwrap();
        assert!(model.requests.is_empty());
        let (tabs, requests) = model.forget("https://embedded.example", &Permission::Camera);
        assert_eq!(tabs, vec!["tab-1"]);
        assert!(requests.is_empty());
        assert!(model.media_origins.is_empty());
        assert_eq!(model.tabs[0].status, "unloaded");
        assert_eq!(model.tabs[0].url, "https://top.example/page");
        assert_eq!(model.tabs[0].conversation_id, "conversation-1");
        assert!(!model.tabs[0].can_go_back);
        assert_eq!(
            model.forget("https://embedded.example", &Permission::Camera),
            (vec![], vec![])
        );
    }
    #[test]
    fn resetting_a_grant_invalidates_its_open_document_but_not_other_tabs() {
        let mut model = pending();
        let mut repeated = model.requests[0].clone();
        repeated.id = "req-2".into();
        model.decision("req-1", "allow").unwrap();
        model.requests.push(repeated);
        model
            .documents
            .insert("unrelated".into(), "other-document".into());
        model.forget("https://embedded.example", &Permission::Camera);
        assert!(
            model.requests.is_empty(),
            "a cached document must lose its pending decisions"
        );
        assert_ne!(
            model.documents.get("tab-1").map(String::as_str),
            Some("doc-1")
        );
        assert_eq!(
            model.documents.get("unrelated").map(String::as_str),
            Some("other-document")
        );
        assert_eq!(
            model.remembered("https://embedded.example", &[Permission::Camera]),
            None
        );
    }
    #[test]
    fn combined_request_block_dominates_and_forget_restores_ask() {
        let mut model = pending();
        model.decision("req-1", "block").unwrap();
        assert_eq!(
            model.remembered(
                "https://embedded.example",
                &[Permission::Camera, Permission::Microphone]
            ),
            Some(false)
        );
        model.forget("https://embedded.example", &Permission::Camera);
        assert_eq!(
            model.remembered("https://embedded.example", &[Permission::Camera]),
            None
        );
    }
    #[test]
    fn unsupported_permissions_and_extra_command_fields_are_rejected() {
        assert!(serde_json::from_str::<Action>(
            r#"{"kind":"forget","origin":"https://example.org","permission":"location"}"#
        )
        .is_err());
        assert!(serde_json::from_str::<Action>(r#"{"kind":"read","tabId":"main"}"#).is_err());
    }
    #[test]
    fn allow_once_consumes_only_the_bound_pending_request() {
        let mut model = pending();
        assert!(model.decision("req-1", "allow_once").unwrap());
        assert!(model.permissions.is_empty());
        assert!(model.decision("req-1", "allow_once").is_err());
    }
    #[test]
    fn saved_choice_uses_requesting_origin_and_only_requested_capability() {
        let mut model = pending();
        assert!(model.decision("req-1", "allow").unwrap());
        assert_eq!(model.permissions.len(), 1);
        assert_eq!(model.permissions[0].origin, "https://embedded.example");
        assert_eq!(model.permissions[0].permission, Permission::Camera);
    }
    #[test]
    fn navigation_invalidates_pending_decisions() {
        let mut model = pending();
        assert_eq!(model.invalidate("tab-1"), ["req-1"]);
        assert!(model.decision("req-1", "allow").is_err());
        assert!(model.permissions.is_empty());
    }
    #[test]
    fn stale_document_and_dismissal_cannot_grant() {
        let mut model = pending();
        model.documents.insert("tab-1".into(), "doc-2".into());
        assert!(model.decision("req-1", "allow").is_err());
        assert!(model.permissions.is_empty());
        assert!(!pending().decision("req-1", "dismiss").unwrap());
    }
    #[test]
    fn restoration_drops_secrets_and_paths() {
        assert_eq!(
            restoration_url("https://example.org/account/token/secret?q=secret#secret"),
            "https://example.org"
        );
        assert_eq!(restoration_url("https://user:secret@example.org"), "");
        assert_eq!(restoration_url("file:///private/example"), "");
    }
    #[test]
    fn ipc_requires_main_identity_and_exact_application_origin() {
        let origin = "http://127.0.0.1:3210";
        assert!(trusted_caller(
            "main",
            &tauri::Url::parse(origin).unwrap(),
            origin
        ));
        assert!(!trusted_caller(
            "browser-1",
            &tauri::Url::parse(origin).unwrap(),
            origin
        ));
        assert!(!trusted_caller(
            "main",
            &tauri::Url::parse("https://example.org").unwrap(),
            origin
        ));
    }
    #[test]
    fn disk_roundtrip_restores_unloaded_and_retains_only_origin_and_preferences() {
        let directory = std::env::temp_dir().join(unique_id("drawloom-browser-test"));
        let b = Browser::new("http://127.0.0.1:3210".into(), directory.clone()).unwrap();
        b.model.lock().unwrap().tabs.push(Tab {
            id: "browser-1".into(),
            conversation_id: "conversation-1".into(),
            title: "Private title".into(),
            url: "https://example.org/secret?q=credential".into(),
            status: "ready".into(),
            can_go_back: true,
            can_go_forward: true,
            error: None,
        });
        b.save().unwrap();
        let restored = Browser::new("http://127.0.0.1:3210".into(), directory.clone()).unwrap();
        let snapshot = restored.snapshot();
        assert_eq!(snapshot.tabs[0].status, "unloaded");
        assert_eq!(snapshot.tabs[0].url, "https://example.org");
        assert_eq!(restored.store, b.store);
        let text = std::fs::read_to_string(directory.join("browser.json")).unwrap();
        assert!(!text.contains("secret"));
        assert!(!text.contains("Private title"));
        std::fs::remove_file(directory.join("browser.json")).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
    #[test]
    fn restored_tab_cannot_claim_the_privileged_main_webview_label() {
        let directory = std::env::temp_dir().join(unique_id("drawloom-browser-test"));
        let b = Browser::new("http://127.0.0.1:3210".into(), directory.clone()).unwrap();
        b.model.lock().unwrap().tabs.push(Tab {
            id: "main".into(),
            conversation_id: "conversation-1".into(),
            title: "Browser".into(),
            url: "".into(),
            status: "unloaded".into(),
            can_go_back: false,
            can_go_forward: false,
            error: None,
        });
        b.save().unwrap();
        let rejected = Browser::new("http://127.0.0.1:3210".into(), directory.clone()).is_err();
        std::fs::remove_file(directory.join("browser.json")).unwrap();
        std::fs::remove_dir(directory).unwrap();
        assert!(
            rejected,
            "Browser metadata must not alias the authenticated main webview"
        );
    }
}
