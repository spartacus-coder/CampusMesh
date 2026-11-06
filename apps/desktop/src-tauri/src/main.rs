// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let _window = tauri::Manager::get_webview_window(app, "main");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CampusMesh desktop application");
}

