fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["browser_command"])),
    )
    .expect("Could not generate the desktop application build context");
}
