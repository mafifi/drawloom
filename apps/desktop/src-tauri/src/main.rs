use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::Manager;
mod browser;
#[cfg(target_os = "macos")]
mod browser_native;
mod browser_policy;

struct Host(Mutex<Child>);
type StartupResult<T> = Result<T, Box<dyn std::error::Error>>;

fn configure_host<T>(
    child: &mut Child,
    setup: impl FnOnce(&mut Child) -> StartupResult<T>,
) -> StartupResult<T> {
    let result = setup(child);
    if result.is_err() {
        stop_host(child);
    }
    result
}

fn consume_setup_failure(
    result: StartupResult<()>,
    report: impl FnOnce(),
    exit: impl FnOnce(),
) -> StartupResult<()> {
    if result.is_err() {
        report();
        exit();
    }
    // Tauri 2.11.5 panics on setup Err in Cocoa's launch callback. Expected
    // startup failures have already been handled and must not cross it.
    Ok(())
}
fn main() {
    let application = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![browser::browser_command])
        .setup(|app| {
            let result = setup_application(app);
            consume_setup_failure(result, show_startup_failure, || app.handle().exit(1))
        })
        .build(application_context());
    let application = match application {
        Ok(application) => application,
        Err(_) => {
            show_startup_failure();
            std::process::exit(1);
        }
    };
    application.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            #[cfg(target_os = "macos")]
            if app.try_state::<browser::Browser>().is_some() {
                browser_native::shutdown(app);
            }
            if let Some(host) = app.try_state::<Host>() {
                if let Ok(mut child) = host.0.lock() {
                    stop_host(&mut child);
                }
            }
        }
    });
}

fn application_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

fn setup_application(app: &mut tauri::App) -> StartupResult<()> {
    let resources = app.path().resource_dir()?;
    let binary = std::env::var_os("DRAWLOOM_HOST_BIN")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| resources.join("host/drawloom-host"));
    let web = std::env::var_os("DRAWLOOM_WEB_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| resources.join("web"));
    let mut child = Command::new(binary)
        .env("DRAWLOOM_WEB_ROOT", web)
        .env(
            "DRAWLOOM_ORCHESTRATION_RUNTIME",
            resources.join("orchestration"),
        )
        .env("DRAWLOOM_KNOWLEDGE_RUNTIME", resources.join("knowledge"))
        .env("DRAWLOOM_MANAGED", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
    // Keep the child locally owned until all startup resources and the
    // main window succeed. Every early-return error drains and reaps it.
    configure_host(&mut child, |child| {
        let ready = read_host_startup(child)?;
        let url = ready.url;
        let origin = url
            .split("/bootstrap")
            .next()
            .ok_or("Invalid host origin")?
            .to_owned();
        app.manage(browser::Browser::load(origin.clone(), ready.data_directory));
        app.add_capability(browser_capability(&origin))?;
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url.parse()?))
            .title("Drawloom")
            .inner_size(1280.0, 850.0)
            .min_inner_size(390.0, 600.0)
            .on_navigation(move |url| url.origin().ascii_serialization() == origin)
            .build()?;
        Ok(())
    })?;
    app.manage(Host(Mutex::new(child)));
    Ok(())
}

fn browser_capability(origin: &str) -> String {
    serde_json::json!({
                "identifier": "trusted-browser-controls",
                "description": "Only the authenticated application webview can control and observe the native browser",
                "local": false, "remote": { "urls": [format!("{origin}/*")] },
                "webviews": ["main"], "permissions": ["allow-browser-command", "core:event:allow-listen", "core:event:allow-unlisten"]
            }).to_string()
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HostReadiness {
    url: String,
    data_directory: std::path::PathBuf,
}

fn parse_host_startup(line: &str) -> StartupResult<HostReadiness> {
    let ready: HostReadiness = serde_json::from_str(line)?;
    if !valid_startup_url(&ready.url) || !ready.data_directory.is_absolute() {
        return Err("Invalid host readiness".into());
    }
    Ok(ready)
}

fn read_host_startup(child: &mut Child) -> StartupResult<HostReadiness> {
    let stdout = child.stdout.take().ok_or("Host output unavailable")?;
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let line = BufReader::new(stdout).lines().next().transpose();
        let _ = sender.send(line);
    });
    match receiver.recv_timeout(std::time::Duration::from_secs(45)) {
        Ok(Ok(Some(line))) => parse_host_startup(&line),
        _ => Err("Local host did not become ready".into()),
    }
}

fn show_startup_failure() {
    // Never expose bootstrap URLs, filesystem paths, host output or private
    // service errors through the native error prompt or console fallback.
    let title = "Drawloom could not start";
    let message = "The local service or required application resources could not be initialized. Check that the current Drawloom installation is complete and available, then try again. Your saved data has not been reset.";
    #[cfg(target_os = "macos")]
    {
        use objc2::{
            msg_send,
            rc::Retained,
            runtime::{AnyClass, AnyObject, NSObject},
        };
        use objc2_foundation::{MainThreadMarker, NSString};
        // NSAlert is a public AppKit API. AppKit is already linked by Tauri;
        // the narrow bridge adds no package or alternate error-page surface.
        if MainThreadMarker::new().is_some() {
            if let Some(class) = AnyClass::get(c"NSAlert") {
                unsafe {
                    let alert: Option<Retained<NSObject>> = msg_send![class, new];
                    if let Some(alert) = alert {
                        let _: () = msg_send![&*alert, setMessageText: &*NSString::from_str(title)];
                        let _: () =
                            msg_send![&*alert, setInformativeText: &*NSString::from_str(message)];
                        let _: *mut AnyObject = msg_send![&*alert, addButtonWithTitle: &*NSString::from_str("Quit Drawloom")];
                        let _: isize = msg_send![&*alert, runModal];
                        return;
                    }
                }
            }
        }
    }
    eprintln!("{title}. {message}");
}
fn stop_host(child: &mut Child) {
    drop(child.stdin.take());
    // Workflow workers and their service each have bounded five-second drains;
    // allow those plus the host's connections to finish before the shell fallback.
    for _ in 0..300 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}
fn valid_startup_url(value: &str) -> bool {
    let Some(suffix) = value.strip_prefix("http://127.0.0.1:") else {
        return false;
    };
    let Some((port, token)) = suffix.split_once("/bootstrap?token=") else {
        return false;
    };
    port.parse::<u16>().is_ok_and(|p| p > 0)
        && token.len() == 64
        && token.bytes().all(|b| b.is_ascii_hexdigit())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readiness_uses_host_directory_and_rejects_missing_or_relative_directory() {
        let url = format!("http://127.0.0.1:4488/bootstrap?token={}", "a".repeat(64));
        let line = serde_json::json!({"url": url, "dataDirectory": "/installation with spaces"})
            .to_string();
        let ready = parse_host_startup(&line).unwrap();
        assert_eq!(
            ready.data_directory,
            std::path::PathBuf::from("/installation with spaces")
        );
        assert_eq!(ready.url, url);
        for invalid in [
            serde_json::json!({"url": url}).to_string(),
            serde_json::json!({"url": url, "dataDirectory": "relative"}).to_string(),
            serde_json::json!({"url": "https://example.org", "dataDirectory": "/installation"})
                .to_string(),
            url,
        ] {
            assert!(parse_host_startup(&invalid).is_err());
        }
    }
    #[test]
    fn browser_command_acl_allows_only_main_at_the_exact_runtime_origin() {
        let mut context = application_context();
        let authority = context.runtime_authority_mut();
        authority
            .add_capability(browser_capability("http://127.0.0.1:3210"))
            .unwrap();
        let origin = tauri::ipc::Origin::Remote {
            url: "http://127.0.0.1:3210/".parse().unwrap(),
        };
        assert!(
            authority
                .resolve_access("browser_command", "main", "main", &origin)
                .is_some(),
            "The HTTP-hosted main application needs its own explicit command permission"
        );
        assert!(authority
            .resolve_access("browser_command", "main", "browser-1", &origin)
            .is_none());
        let other = tauri::ipc::Origin::Remote {
            url: "https://example.org/".parse().unwrap(),
        };
        assert!(authority
            .resolve_access("browser_command", "main", "main", &other)
            .is_none());
        assert!(authority
            .resolve_access(
                "browser_command",
                "main",
                "main",
                &tauri::ipc::Origin::Local
            )
            .is_none());
    }
    #[test]
    fn invalid_host_readiness_is_rejected_and_the_child_is_reaped() {
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("printf 'invalid readiness\\n'; cat >/dev/null")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let result = configure_host(&mut child, read_host_startup);
        let reaped = child.try_wait().unwrap().is_some();
        stop_host(&mut child);
        assert!(result.is_err());
        assert!(
            reaped,
            "Invalid host readiness must not leave a process running"
        );
    }
    #[test]
    fn resource_failure_after_spawn_drains_and_reaps_the_owned_host() {
        // This is a disposable pipe-controlled subprocess, not a Drawloom host.
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("cat >/dev/null")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let result: StartupResult<()> =
            configure_host(&mut child, |_| Err("Resource initialization failed".into()));
        let reaped = child.try_wait().unwrap().is_some();
        // Clean up even when the pre-fix regression fails.
        stop_host(&mut child);
        assert!(result.is_err());
        assert!(
            reaped,
            "A resource error must drain and reap the child before returning to native setup"
        );
    }
    #[test]
    fn expected_setup_error_is_consumed_after_feedback_and_exit_request() {
        let events = std::cell::RefCell::new(Vec::new());
        let result = consume_setup_failure(
            Err("host path or token must not be exposed".into()),
            || events.borrow_mut().push("feedback"),
            || events.borrow_mut().push("exit"),
        );
        assert!(
            result.is_ok(),
            "An expected error must not reach Tauri's setup panic boundary"
        );
        assert_eq!(*events.borrow(), ["feedback", "exit"]);
    }
    #[test]
    fn successful_setup_does_not_request_exit() {
        let called = std::cell::Cell::new(false);
        assert!(consume_setup_failure(Ok(()), || called.set(true), || called.set(true)).is_ok());
        assert!(!called.get());
    }
    #[test]
    fn only_local_authenticated_startup() {
        assert!(valid_startup_url(&format!(
            "http://127.0.0.1:3210/bootstrap?token={}",
            "a".repeat(64)
        )));
        assert!(!valid_startup_url("https://example.com"));
        assert!(!valid_startup_url("http://127.0.0.1:0/bootstrap?token=x"));
    }
    #[test]
    fn graceful_host_drain_is_not_cut_off_after_two_seconds() {
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("cat >/dev/null; sleep 2.2")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        stop_host(&mut child);
        assert!(child.wait().unwrap().success(), "The native shell must allow the workflow provider to drain before force-stopping the host");
    }
}
