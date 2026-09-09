use std::{io::{BufRead, BufReader}, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::Manager;

struct Host(Mutex<Child>);
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let binary = std::env::var_os("DRAWLOOM_HOST_BIN").map(std::path::PathBuf::from).unwrap_or_else(|| resources.join("host/drawloom-host"));
            let web = std::env::var_os("DRAWLOOM_WEB_ROOT").map(std::path::PathBuf::from).unwrap_or_else(|| resources.join("web"));
            let mut child = Command::new(binary).env("DRAWLOOM_WEB_ROOT", web).env("DRAWLOOM_MANAGED", "1").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn()?;
            let stdout = child.stdout.take().ok_or("Host output unavailable")?;
            let (sender, receiver) = std::sync::mpsc::channel();
            std::thread::spawn(move || { let line = BufReader::new(stdout).lines().next().transpose(); let _ = sender.send(line); });
            let url = match receiver.recv_timeout(std::time::Duration::from_secs(45)) {
                Ok(Ok(Some(line))) if valid_startup_url(&line) => line,
                _ => { let _ = child.kill(); let _ = child.wait(); return Err("Local host did not become ready".into()); }
            };
            let origin = url.split("/bootstrap").next().ok_or("Invalid host origin")?.to_owned();
            app.manage(Host(Mutex::new(child)));
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url.parse()?))
                .title("Drawloom").inner_size(1280.0, 850.0).min_inner_size(390.0, 600.0)
                .on_navigation(move |url| url.origin().ascii_serialization() == origin)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not start Drawloom")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(host) = app.try_state::<Host>() { if let Ok(mut child) = host.0.lock() {
                    drop(child.stdin.take());
                    for _ in 0..40 { if child.try_wait().ok().flatten().is_some() { return; } std::thread::sleep(std::time::Duration::from_millis(50)); }
                    let _ = child.kill(); let _ = child.wait();
                } }
            }
        });
}
fn valid_startup_url(value: &str) -> bool {
    let Some(suffix) = value.strip_prefix("http://127.0.0.1:") else { return false; };
    let Some((port, token)) = suffix.split_once("/bootstrap?token=") else { return false; };
    port.parse::<u16>().is_ok_and(|p| p > 0) && token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit())
}
#[cfg(test)] mod tests { use super::*; #[test] fn only_local_authenticated_startup() {
    assert!(valid_startup_url(&format!("http://127.0.0.1:3210/bootstrap?token={}", "a".repeat(64))));
    assert!(!valid_startup_url("https://example.com")); assert!(!valid_startup_url("http://127.0.0.1:0/bootstrap?token=x"));
} }
