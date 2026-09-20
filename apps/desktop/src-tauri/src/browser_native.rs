//! macOS-only child views and permission callback ownership. All retained Cocoa
//! objects and completion blocks live on the native main thread.
use crate::browser::{self, Action, Bounds, Browser, Permission, Request, Tab};
use block2::{Block, RcBlock};
use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, NSObject, ProtocolObject, Sel},
    DefinedClass, MainThreadOnly, Message,
};
use objc2_foundation::{MainThreadMarker, NSArray, NSError, NSObjectProtocol, NSURL};
use objc2_web_kit::{
    WKFrameInfo, WKMediaCaptureState, WKMediaCaptureType, WKNavigation, WKNavigationAction,
    WKNavigationActionPolicy, WKNavigationDelegate, WKNavigationResponse,
    WKNavigationResponsePolicy, WKOpenPanelParameters, WKPermissionDecision, WKSecurityOrigin,
    WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};
use std::{cell::RefCell, collections::BTreeMap};
use tauri::{Emitter, Manager};

type Completion = RcBlock<dyn Fn(WKPermissionDecision)>;
struct NativeTab {
    view: Retained<WKWebView>,
    _ui: Retained<BrowserUiDelegate>,
    _navigation: Retained<BrowserNavigationDelegate>,
    visible: bool,
}
#[derive(Default)]
struct Native {
    tabs: BTreeMap<String, NativeTab>,
    pending: BTreeMap<String, Completion>,
}
thread_local! { static NATIVE: RefCell<Native> = RefCell::new(Native::default()); }

struct UiIvars {
    app: tauri::AppHandle,
    tab: String,
    original: Retained<ProtocolObject<dyn WKUIDelegate>>,
}
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = UiIvars]
    struct BrowserUiDelegate;
    unsafe impl NSObjectProtocol for BrowserUiDelegate {}
    unsafe impl WKUIDelegate for BrowserUiDelegate {
        #[unsafe(method(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:))]
        fn media(
            &self,
            view: &WKWebView,
            origin: &WKSecurityOrigin,
            frame: &WKFrameInfo,
            capture: WKMediaCaptureType,
            handler: &Block<dyn Fn(WKPermissionDecision)>,
        ) {
            request_media(
                &self.ivars().app,
                &self.ivars().tab,
                view,
                origin,
                frame,
                capture,
                handler,
            );
        }
        #[unsafe(method(webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:))]
        fn motion(
            &self,
            _view: &WKWebView,
            _origin: &WKSecurityOrigin,
            _frame: &WKFrameInfo,
            handler: &Block<dyn Fn(WKPermissionDecision)>,
        ) {
            handler.call((WKPermissionDecision::Deny,));
        }
        #[unsafe(method(webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:))]
        unsafe fn upload(
            &self,
            view: &WKWebView,
            parameters: &WKOpenPanelParameters,
            frame: &WKFrameInfo,
            handler: &Block<dyn Fn(*mut NSArray<NSURL>)>,
        ) {
            // Preserve Wry's native, user-controlled file picker. Nothing selects
            // or uploads a file on the user's behalf.
            let _: () = msg_send![&*self.ivars().original, webView: view, runOpenPanelWithParameters: parameters, initiatedByFrame: frame, completionHandler: handler];
        }
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        unsafe fn popup(
            &self,
            _view: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            _action: &WKNavigationAction,
            _features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            feedback(
                &self.ivars().app,
                &self.ivars().tab,
                "Popup blocked. Open this site in your external browser if needed.",
            );
            None
        }
    }
);

struct NavigationIvars {
    app: tauri::AppHandle,
    tab: String,
    original: Retained<ProtocolObject<dyn WKNavigationDelegate>>,
}
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = NavigationIvars]
    struct BrowserNavigationDelegate;
    unsafe impl NSObjectProtocol for BrowserNavigationDelegate {
        #[unsafe(method(respondsToSelector:))]
        fn responds(&self, selector: Sel) -> bool {
            unsafe { let own: bool = msg_send![super(self), respondsToSelector: selector]; own || self.ivars().original.respondsToSelector(selector) }
        }
    }
    impl BrowserNavigationDelegate {
        #[unsafe(method(forwardingTargetForSelector:))]
        fn forward(&self, _selector: Sel) -> *const AnyObject { Retained::as_ptr(&self.ivars().original).cast() }
    }
    unsafe impl WKNavigationDelegate for BrowserNavigationDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        unsafe fn response(&self, view: &WKWebView, response: &WKNavigationResponse, handler: &Block<dyn Fn(WKNavigationResponsePolicy)>) {
            let app = &self.ivars().app;
            let url = response.response().URL().and_then(|u| u.absoluteString()).and_then(|u| tauri::Url::parse(&u.to_string()).ok());
            if !url.as_ref().is_some_and(|u| u.as_str() == "about:blank" || crate::browser_policy::navigation_allowed(u, &app.state::<Browser>().origin)) {
                invalidate(app, &self.ivars().tab);
                feedback(app, &self.ivars().tab, "Redirect blocked: the destination is not permitted in the browser panel.");
                handler.call((WKNavigationResponsePolicy::Cancel,)); return;
            }
            let _: () = msg_send![&*self.ivars().original, webView: view, decidePolicyForNavigationResponse: response, decisionHandler: handler];
        }
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        unsafe fn navigation(&self, view: &WKWebView, action: &WKNavigationAction, handler: &Block<dyn Fn(WKNavigationActionPolicy)>) {
            let app = &self.ivars().app;
            let id = &self.ivars().tab;
            let url = action.request().URL().and_then(|u| u.absoluteString()).and_then(|u| tauri::Url::parse(&u.to_string()).ok());
            let allowed = url.as_ref().is_some_and(|url| url.as_str() == "about:blank" || crate::browser_policy::navigation_allowed(url, &app.state::<Browser>().origin));
            if !allowed || action.shouldPerformDownload() {
                feedback(app, id, if allowed { "Download cancelled. Open the site in your external browser to download files." } else { "Navigation blocked: this address is not permitted in the browser panel." });
                handler.call((WKNavigationActionPolicy::Cancel,)); return;
            }
            if let Some(frame) = action.targetFrame() {
                // Any frame navigation invalidates retained requests, including
                // requests from embedded frames. Only main-frame navigation
                // changes the displayed address and navigation state.
                invalidate(app, id);
                if frame.isMainFrame() {
                    let state = app.state::<Browser>();
                    if let Some(tab) = state.model.lock().unwrap().tabs.iter_mut().find(|t| &t.id == id) { tab.url = url.as_ref().map(|u| u.to_string()).unwrap_or_default(); tab.status = "loading".into(); tab.error = None; }
                    browser::changed(app);
                }
            }
            let _: () = msg_send![&*self.ivars().original, webView: view, decidePolicyForNavigationAction: action, decisionHandler: handler];
        }
        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn provisional_failure(&self, _view: &WKWebView, _navigation: Option<&WKNavigation>, error: &NSError) { self.failure(error); }
        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn failure_after_commit(&self, _view: &WKWebView, _navigation: Option<&WKNavigation>, error: &NSError) { self.failure(error); }
        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn terminated(&self, _view: &WKWebView) { invalidate(&self.ivars().app, &self.ivars().tab); feedback(&self.ivars().app, &self.ivars().tab, "Website process stopped. Reload to try again."); }
    }
);
impl BrowserNavigationDelegate {
    fn failure(&self, error: &NSError) {
        // WebKit cancellation accompanies stop, redirects and blocked downloads.
        if error.code() == -999 {
            return;
        }
        invalidate(&self.ivars().app, &self.ivars().tab);
        let app = &self.ivars().app;
        let state = app.state::<Browser>();
        if let Some(tab) = state
            .model
            .lock()
            .unwrap()
            .tabs
            .iter_mut()
            .find(|t| t.id == self.ivars().tab)
        {
            tab.status = "failed".into();
            tab.error =
                Some("Website could not load. Retry or open it in your external browser.".into());
        }
        browser::changed(app);
    }
}

fn native_origin(origin: &WKSecurityOrigin) -> Option<String> {
    unsafe {
        let scheme = origin.protocol().to_string();
        let host = origin.host().to_string();
        let port = origin.port();
        if !matches!(scheme.as_str(), "http" | "https") || host.is_empty() {
            return None;
        }
        let host = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host
        };
        let url = if port > 0 {
            format!("{scheme}://{host}:{port}")
        } else {
            format!("{scheme}://{host}")
        };
        tauri::Url::parse(&url)
            .ok()
            .map(|u| u.origin().ascii_serialization())
    }
}

fn request_media(
    app: &tauri::AppHandle,
    tab_id: &str,
    view: &WKWebView,
    origin: &WKSecurityOrigin,
    frame: &WKFrameInfo,
    capture: WKMediaCaptureType,
    handler: &Block<dyn Fn(WKPermissionDecision)>,
) {
    let permissions = if capture == WKMediaCaptureType::Camera {
        vec![Permission::Camera]
    } else if capture == WKMediaCaptureType::Microphone {
        vec![Permission::Microphone]
    } else if capture == WKMediaCaptureType::CameraAndMicrophone {
        vec![Permission::Camera, Permission::Microphone]
    } else {
        handler.call((WKPermissionDecision::Deny,));
        return;
    };
    let valid_view = NATIVE.with(|n| {
        n.borrow()
            .tabs
            .get(tab_id)
            .is_some_and(|t| std::ptr::eq(&*t.view, view))
    });
    let requesting = native_origin(origin);
    let frame_origin = unsafe { native_origin(&frame.securityOrigin()) };
    let top = unsafe {
        view.URL()
            .and_then(|u| u.absoluteString())
            .and_then(|u| tauri::Url::parse(&u.to_string()).ok())
            .filter(|u| matches!(u.scheme(), "http" | "https"))
            .map(|u| u.origin().ascii_serialization())
    };
    let Some(state) = app.try_state::<Browser>() else {
        handler.call((WKPermissionDecision::Deny,));
        return;
    };
    let trusted_prompt = app.get_webview("main").is_some_and(|w| {
        w.url()
            .is_ok_and(|u| u.origin().ascii_serialization() == state.origin)
    });
    if !valid_view
        || !trusted_prompt
        || requesting.is_none()
        || requesting != frame_origin
        || top.is_none()
    {
        handler.call((WKPermissionDecision::Deny,));
        return;
    }
    let origin = requesting.unwrap();
    let top_origin = top.unwrap();
    let mut model = state.model.lock().unwrap();
    let Some(document_id) = model.documents.get(tab_id).cloned() else {
        drop(model);
        handler.call((WKPermissionDecision::Deny,));
        return;
    };
    model
        .media_origins
        .entry(tab_id.to_owned())
        .or_default()
        .insert(origin.clone());
    if let Some(allowed) = model.remembered(&origin, &permissions) {
        drop(model);
        handler.call((if allowed {
            WKPermissionDecision::Grant
        } else {
            WKPermissionDecision::Deny
        },));
        return;
    }
    let id = browser::unique_id("permission");
    model.requests.push(Request {
        id: id.clone(),
        tab_id: tab_id.to_owned(),
        document_id,
        origin,
        top_origin,
        permissions,
    });
    drop(model);
    NATIVE.with(|n| {
        n.borrow_mut().pending.insert(id.clone(), handler.copy());
    });
    update_visibility();
    // Failed event delivery is denial, never the dependency's default grant.
    let delivered = app.get_webview("main").is_some_and(|w| {
        w.emit_to(
            tauri::EventTarget::webview("main"),
            "drawloom-browser-changed",
            state.snapshot(),
        )
        .is_ok()
    });
    if !delivered {
        invalidate(app, tab_id);
    }
}

fn complete(ids: &[String], allow: bool) {
    let handlers: Vec<_> = NATIVE.with(|n| {
        let mut n = n.borrow_mut();
        ids.iter().filter_map(|id| n.pending.remove(id)).collect()
    });
    for handler in handlers {
        handler.call((if allow {
            WKPermissionDecision::Grant
        } else {
            WKPermissionDecision::Deny
        },));
    }
    update_visibility();
}
fn update_visibility() {
    NATIVE.with(|n| {
        let n = n.borrow();
        let pending = !n.pending.is_empty();
        for tab in n.tabs.values() {
            tab.view.setHidden(pending || !tab.visible);
        }
    });
}
fn invalidate(app: &tauri::AppHandle, tab: &str) {
    let state = app.state::<Browser>();
    let ids = state.model.lock().unwrap().invalidate(tab);
    complete(&ids, false);
    browser::changed(app);
}
fn feedback(app: &tauri::AppHandle, tab: &str, message: &str) {
    let state = app.state::<Browser>();
    if let Some(t) = state
        .model
        .lock()
        .unwrap()
        .tabs
        .iter_mut()
        .find(|t| t.id == tab)
    {
        t.error = Some(message.chars().take(1024).collect());
    }
    browser::changed(app);
}

fn on_native<T: Send + 'static>(
    webview: &tauri::Webview,
    action: impl FnOnce(&WKWebView) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    webview
        .with_webview(move |platform| {
            // Tauri documents this pointer as the WKWebView, on the main thread.
            let view = unsafe { &*(platform.inner() as *const WKWebView) };
            let _ = tx.send(action(view));
        })
        .map_err(|e| e.to_string())?;
    rx.recv()
        .map_err(|_| "Native browser operation interrupted".to_string())?
}

fn ensure_view(app: &tauri::AppHandle, tab_id: &str) -> Result<tauri::Webview, String> {
    if let Some(view) = app.get_webview(tab_id) {
        return Ok(view);
    }
    let state = app.state::<Browser>();
    let origin = state.origin.clone();
    let nav_app = app.clone();
    let nav_id = tab_id.to_owned();
    let title_app = app.clone();
    let title_id = tab_id.to_owned();
    let load_app = app.clone();
    let load_id = tab_id.to_owned();
    let download_app = app.clone();
    let download_id = tab_id.to_owned();
    let builder = tauri::webview::WebviewBuilder::new(
        tab_id,
        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .data_store_identifier(state.store)
    .on_navigation(move |url| {
        if url.as_str() == "about:blank" {
            return true;
        }
        if !crate::browser_policy::navigation_allowed(url, &origin) {
            feedback(
                &nav_app,
                &nav_id,
                "Navigation blocked: this address is not permitted in the browser panel.",
            );
            return false;
        }
        true
    })
    .on_document_title_changed(move |_, title| {
        let state = title_app.state::<Browser>();
        if let Some(t) = state
            .model
            .lock()
            .unwrap()
            .tabs
            .iter_mut()
            .find(|t| t.id == title_id)
        {
            t.title = title.chars().take(512).collect();
        }
        browser::changed(&title_app);
    })
    .on_page_load(move |_, payload| {
        let state = load_app.state::<Browser>();
        if payload.url().as_str() == "about:blank" {
            return;
        }
        let (back, forward) = NATIVE.with(|n| {
            n.borrow()
                .tabs
                .get(&load_id)
                .map(|t| unsafe { (t.view.canGoBack(), t.view.canGoForward()) })
                .unwrap_or_default()
        });
        if let Some(t) = state
            .model
            .lock()
            .unwrap()
            .tabs
            .iter_mut()
            .find(|t| t.id == load_id)
        {
            t.url = payload.url().to_string();
            t.status = if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                "ready"
            } else {
                "loading"
            }
            .into();
            t.can_go_back = back;
            t.can_go_forward = forward;
        }
        if state.save().is_err() {
            feedback(&load_app, &load_id, "Browser state could not be saved.");
        }
        browser::changed(&load_app);
    })
    .on_download(move |_, _| {
        feedback(
            &download_app,
            &download_id,
            "Download cancelled. Open the site in your external browser to download files.",
        );
        false
    });
    let view = app
        .get_window("main")
        .ok_or("Main window unavailable")?
        .add_child(
            builder,
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(1.0, 1.0),
        )
        .map_err(|e| e.to_string())?;
    view.hide().map_err(|e| e.to_string())?;
    let install_app = app.clone();
    let install_id = tab_id.to_owned();
    let result = on_native(&view, move |native| {
        let mtm = MainThreadMarker::new().ok_or("Native browser requires the main thread")?;
        let ui_original =
            unsafe { native.UIDelegate() }.ok_or("Original upload delegate unavailable")?;
        let nav_original = unsafe { native.navigationDelegate() }
            .ok_or("Original navigation delegate unavailable")?;
        let ui = mtm.alloc::<BrowserUiDelegate>().set_ivars(UiIvars {
            app: install_app.clone(),
            tab: install_id.clone(),
            original: ui_original,
        });
        let ui: Retained<BrowserUiDelegate> = unsafe { msg_send![super(ui), init] };
        let navigation = mtm
            .alloc::<BrowserNavigationDelegate>()
            .set_ivars(NavigationIvars {
                app: install_app.clone(),
                tab: install_id.clone(),
                original: nav_original,
            });
        let navigation: Retained<BrowserNavigationDelegate> =
            unsafe { msg_send![super(navigation), init] };
        unsafe {
            native.setUIDelegate(Some(ProtocolObject::from_ref(&*ui)));
            native.setNavigationDelegate(Some(ProtocolObject::from_ref(&*navigation)));
            native.setHidden(true);
        }
        NATIVE.with(|n| {
            n.borrow_mut().tabs.insert(
                install_id.clone(),
                NativeTab {
                    view: native.retain(),
                    _ui: ui,
                    _navigation: navigation,
                    visible: false,
                },
            )
        });
        install_app
            .state::<Browser>()
            .model
            .lock()
            .unwrap()
            .documents
            .insert(install_id, browser::unique_id("document"));
        Ok(())
    });
    if let Err(error) = result {
        let _ = view.close();
        return Err(error);
    }
    Ok(view)
}

pub fn command(app: &tauri::AppHandle, action: Action) -> Result<(), String> {
    let browser = app.state::<Browser>();
    match action {
        Action::Read {} => return Ok(()),
        Action::Open { conversation_id } => {
            if conversation_id.is_empty() || conversation_id.len() > 256 {
                return Err("Invalid conversation identity".into());
            }
            let id = browser::unique_id("browser");
            browser.model.lock().unwrap().tabs.push(Tab {
                id,
                conversation_id,
                title: "New tab".into(),
                url: "".into(),
                status: "blank".into(),
                can_go_back: false,
                can_go_forward: false,
                error: None,
            });
        }
        Action::Forget { origin, permission } => {
            if tauri::Url::parse(&origin)
                .ok()
                .is_none_or(|u| u.origin().ascii_serialization() != origin)
            {
                return Err("Invalid site origin".into());
            }
            let owned_app = app.clone();
            let main = app
                .get_webview("main")
                .ok_or("Trusted settings unavailable")?;
            let (tabs, saved) = on_native(&main, move |_| {
                let browser = owned_app.state::<Browser>();
                let (tabs, requests) = browser.model.lock().unwrap().forget(&origin, &permission);
                complete(&requests, false);
                // A website can reuse WebKit's document-local grant without
                // another delegate callback. Stop capture and detach that exact
                // instance before closing it; resetting only preferences is not
                // sufficient. Retain tab metadata for explicit reopening.
                NATIVE.with(|n| {
                    let mut n = n.borrow_mut();
                    for id in &tabs {
                        if let Some(tab) = n.tabs.remove(id) {
                            unsafe {
                                tab.view.setCameraCaptureState_completionHandler(
                                    WKMediaCaptureState::None,
                                    None,
                                );
                                tab.view.setMicrophoneCaptureState_completionHandler(
                                    WKMediaCaptureState::None,
                                    None,
                                );
                                tab.view.stopLoading();
                                tab.view.setHidden(true);
                                tab.view.setUIDelegate(None);
                                tab.view.setNavigationDelegate(None);
                            }
                        }
                    }
                });
                // Persist even if a later native close fails; failure is shown
                // rather than restoring a revoked grant or retrying navigation.
                Ok((tabs, browser.save()))
            })?;
            let mut close_error = None;
            for id in tabs {
                if let Some(view) = app.get_webview(&id) {
                    if let Err(error) = view.close() {
                        close_error = Some(error.to_string());
                    }
                }
            }
            saved?;
            if let Some(error) = close_error {
                return Err(error);
            }
        }
        Action::Decide { request_id, choice } => {
            // Decision and native completion are serialized on Cocoa's thread,
            // together with navigation invalidation. Persist before granting.
            let owned_app = app.clone();
            let main = app
                .get_webview("main")
                .ok_or("Trusted prompt unavailable")?;
            on_native(&main, move |_| {
                let browser = owned_app.state::<Browser>();
                let decision = browser.model.lock().unwrap().decision(&request_id, &choice);
                let allow = decision.as_ref().copied().unwrap_or(false);
                let saved = browser.save();
                complete(&[request_id], allow && saved.is_ok());
                decision?;
                saved
            })?;
        }
        other => {
            let id = match &other {
                Action::Navigate { tab_id, .. }
                | Action::Back { tab_id }
                | Action::Forward { tab_id }
                | Action::Reload { tab_id }
                | Action::Stop { tab_id }
                | Action::Close { tab_id }
                | Action::Place { tab_id, .. }
                | Action::External { tab_id } => tab_id.clone(),
                _ => unreachable!(),
            };
            let tab = browser
                .model
                .lock()
                .unwrap()
                .tabs
                .iter()
                .find(|t| t.id == id)
                .cloned()
                .ok_or("Unknown browser tab")?;
            match other {
                Action::Navigate { url, .. } => {
                    if url.len() > 8192 {
                        return Err("Address is too long".into());
                    }
                    let parsed =
                        tauri::Url::parse(&url).map_err(|_| "Enter an HTTP or HTTPS address")?;
                    if !crate::browser_policy::navigation_allowed(&parsed, &browser.origin) {
                        return Err("This address is not permitted in the browser panel".into());
                    }
                    let view = ensure_view(app, &id)?;
                    view.navigate(parsed).map_err(|e| e.to_string())?;
                }
                Action::Place {
                    bounds, visible, ..
                } => {
                    if !valid_bounds(bounds) {
                        return Err("Invalid browser bounds".into());
                    }
                    // Hiding an unloaded/destroyed panel is a layout operation,
                    // not authorization to create a native website instance.
                    let view = match app.get_webview(&id) {
                        Some(view) => view,
                        None if !visible || tab.status == "unloaded" => return Ok(()),
                        None => ensure_view(app, &id)?,
                    };
                    view.set_position(tauri::LogicalPosition::new(bounds.x, bounds.y))
                        .map_err(|e| e.to_string())?;
                    view.set_size(tauri::LogicalSize::new(
                        bounds.width.max(1.0),
                        bounds.height.max(1.0),
                    ))
                    .map_err(|e| e.to_string())?;
                    on_native(&view, move |_| {
                        NATIVE.with(|n| {
                            if let Some(t) = n.borrow_mut().tabs.get_mut(&id) {
                                t.visible = visible && bounds.width > 0.0 && bounds.height > 0.0;
                            }
                        });
                        update_visibility();
                        Ok(())
                    })?;
                    // Geometry is transient; do not rewrite preferences or
                    // broadcast an unchanged content snapshot on every resize.
                    return Ok(());
                }
                Action::Close { .. } => {
                    if let Some(view) = app.get_webview(&id) {
                        let close_app = app.clone();
                        let close_id = id.clone();
                        on_native(&view, move |native| {
                            invalidate(&close_app, &close_id);
                            unsafe {
                                native.stopLoading();
                                native.setUIDelegate(None);
                                native.setNavigationDelegate(None);
                            }
                            NATIVE.with(|n| n.borrow_mut().tabs.remove(&close_id));
                            Ok(())
                        })?;
                        view.close().map_err(|e| e.to_string())?;
                    }
                    let mut model = browser.model.lock().unwrap();
                    model.tabs.retain(|t| t.id != id);
                    model.documents.remove(&id);
                    model.media_origins.remove(&id);
                }
                Action::External { .. } => {
                    let url = tauri::Url::parse(&tab.url).map_err(|_| "No website to open")?;
                    if !crate::browser_policy::navigation_allowed(&url, &browser.origin) {
                        return Err("External address is not permitted".into());
                    }
                    std::process::Command::new("/usr/bin/open")
                        .arg(url.as_str())
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                Action::Back { .. }
                | Action::Forward { .. }
                | Action::Reload { .. }
                | Action::Stop { .. } => {
                    let view = app
                        .get_webview(&id)
                        .ok_or("Open this restored tab before navigating")?;
                    let owned_app = app.clone();
                    on_native(&view, move |native| {
                        invalidate(&owned_app, &id);
                        unsafe {
                            match other {
                                Action::Back { .. } => {
                                    native.goBack();
                                }
                                Action::Forward { .. } => {
                                    native.goForward();
                                }
                                Action::Reload { .. } => {
                                    native.reload();
                                }
                                _ => {
                                    native.stopLoading();
                                }
                            }
                        }
                        if let Some(t) = owned_app
                            .state::<Browser>()
                            .model
                            .lock()
                            .unwrap()
                            .tabs
                            .iter_mut()
                            .find(|t| t.id == id)
                        {
                            t.can_go_back = unsafe { native.canGoBack() };
                            t.can_go_forward = unsafe { native.canGoForward() };
                            t.status = if unsafe { native.isLoading() } {
                                "loading"
                            } else {
                                "ready"
                            }
                            .into();
                        }
                        Ok(())
                    })?;
                }
                _ => unreachable!(),
            }
        }
    }
    browser.save()?;
    browser::changed(app);
    Ok(())
}
fn valid_bounds(b: Bounds) -> bool {
    [b.x, b.y, b.width, b.height]
        .iter()
        .all(|n| n.is_finite() && *n >= 0.0 && *n <= 100_000.0)
}
pub fn shutdown(app: &tauri::AppHandle) {
    let ids: Vec<_> = app
        .state::<Browser>()
        .model
        .lock()
        .unwrap()
        .requests
        .iter()
        .map(|r| r.id.clone())
        .collect();
    app.state::<Browser>()
        .model
        .lock()
        .unwrap()
        .requests
        .clear();
    complete(&ids, false);
    NATIVE.with(|n| {
        let mut n = n.borrow_mut();
        for tab in n.tabs.values() {
            unsafe {
                tab.view.stopLoading();
                tab.view.setUIDelegate(None);
                tab.view.setNavigationDelegate(None);
            }
        }
        n.tabs.clear();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use objc2::ClassType;
    use std::{cell::Cell, rc::Rc};

    #[test]
    fn copied_native_completion_survives_callback_scope_and_cannot_resolve_twice() {
        let calls = Rc::new(Cell::new(0));
        let decision = Rc::new(Cell::new(WKPermissionDecision::Prompt));
        {
            let calls = calls.clone();
            let decision = decision.clone();
            let block = RcBlock::new(move |value: WKPermissionDecision| {
                calls.set(calls.get() + 1);
                decision.set(value);
            });
            NATIVE.with(|n| {
                n.borrow_mut()
                    .pending
                    .insert("native-request".into(), block.copy())
            });
        }
        complete(&["native-request".into()], true);
        complete(&["native-request".into()], true);
        assert_eq!(calls.get(), 1);
        assert_eq!(decision.get(), WKPermissionDecision::Grant);
    }
    #[test]
    fn invalidation_completes_native_request_with_denial() {
        let decision = Rc::new(Cell::new(WKPermissionDecision::Prompt));
        let target = decision.clone();
        let block = RcBlock::new(move |value: WKPermissionDecision| target.set(value));
        NATIVE.with(|n| {
            n.borrow_mut()
                .pending
                .insert("cancelled-request".into(), block.copy())
        });
        complete(&["cancelled-request".into()], false);
        assert_eq!(decision.get(), WKPermissionDecision::Deny);
        assert!(NATIVE.with(|n| n.borrow().pending.is_empty()));
    }
    #[test]
    fn native_delegate_callback_abis_register() {
        // objc2 validates declared method encodings against runtime protocols
        // during class registration in debug/test builds.
        let _ = BrowserUiDelegate::class();
        let _ = BrowserNavigationDelegate::class();
    }
}
