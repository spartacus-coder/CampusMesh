// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod lan;
mod queue;
mod swarm;

use db::{Database, DbContact, DbConversation, DbMessage};
use lan::{LanBeacon, LanDiscoveryEngine};
use queue::SimpleXQueue;
use serde_json::Value;
use std::sync::Arc;
use swarm::{SwarmSidecarManager, SwarmStatusSnapshot};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};

#[tauri::command]
fn db_save_message(db: State<'_, Arc<Database>>, msg: DbMessage) -> Result<(), String> {
    db.save_message(msg).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_messages(
    db: State<'_, Arc<Database>>,
    conversation_id: String,
) -> Result<Vec<DbMessage>, String> {
    db.get_messages(&conversation_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_save_conversation(db: State<'_, Arc<Database>>, conv: DbConversation) -> Result<(), String> {
    db.save_conversation(conv).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_conversations(db: State<'_, Arc<Database>>) -> Result<Vec<DbConversation>, String> {
    db.get_conversations().map_err(|e| e.to_string())
}

#[tauri::command]
fn db_save_contact(db: State<'_, Arc<Database>>, contact: DbContact) -> Result<(), String> {
    db.save_contact(contact).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_contacts(db: State<'_, Arc<Database>>) -> Result<Vec<DbContact>, String> {
    db.get_contacts().map_err(|e| e.to_string())
}

#[tauri::command]
fn lan_start_discovery(
    app: AppHandle,
    lan: State<'_, Arc<LanDiscoveryEngine>>,
    local_fingerprint: String,
) -> Result<(), String> {
    lan.start(app, local_fingerprint)
}

#[tauri::command]
fn lan_broadcast_beacon(
    lan: State<'_, Arc<LanDiscoveryEngine>>,
    beacon: LanBeacon,
) -> Result<(), String> {
    lan.broadcast(beacon)
}

#[tauri::command]
fn lan_stop_discovery(lan: State<'_, Arc<LanDiscoveryEngine>>) -> Result<(), String> {
    lan.stop();
    Ok(())
}

#[tauri::command]
async fn lan_send_direct(
    lan: State<'_, Arc<LanDiscoveryEngine>>,
    ip: String,
    port: u16,
    payload: String,
) -> Result<(), String> {
    let engine = lan.inner().clone();
    tauri::async_runtime::spawn_blocking(move || engine.send_direct(&ip, port, &payload))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn swarm_start(
    app: AppHandle,
    swarm: State<'_, Arc<SwarmSidecarManager>>,
) -> Result<SwarmStatusSnapshot, String> {
    let mgr = swarm.inner().clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = mgr.ensure_started(&app_clone);
        Ok(mgr.status(&app_clone))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn swarm_command(
    app: AppHandle,
    swarm: State<'_, Arc<SwarmSidecarManager>>,
    cmd: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let mgr = swarm.inner().clone();
    let p = params.unwrap_or_else(|| serde_json::json!({}));
    tauri::async_runtime::spawn_blocking(move || mgr.send_command(&app, &cmd, p))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn swarm_status(
    app: AppHandle,
    swarm: State<'_, Arc<SwarmSidecarManager>>,
) -> SwarmStatusSnapshot {
    swarm.status(&app)
}

#[tauri::command]
fn swarm_stop(swarm: State<'_, Arc<SwarmSidecarManager>>) -> Result<(), String> {
    swarm.stop();
    Ok(())
}

#[tauri::command]
fn simplex_derive_queue_id(sender: String, recipient: String, epoch: u64) -> String {
    SimpleXQueue::derive_queue_id(&sender, &recipient, epoch)
}

#[tauri::command]
fn simplex_derive_safety_number(pubkey_a: String, pubkey_b: String) -> String {
    SimpleXQueue::derive_safety_number(&pubkey_a, &pubkey_b)
}

#[tauri::command]
fn window_alert_incoming_call(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Setup SQLite Database in OS AppData directory
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = app_dir.join("mesh_vault.db");
            let database = Arc::new(
                Database::new(db_path).expect("Failed to initialize SQLite mesh vault"),
            );
            app.manage(database);

            // Setup LAN Multicast Discovery Engine
            let lan_engine = Arc::new(LanDiscoveryEngine::new());
            app.manage(lan_engine);

            // Setup Holepunch Bare Runtime Swarm Sidecar Manager
            let swarm_manager = Arc::new(SwarmSidecarManager::new());
            app.manage(swarm_manager);

            // Build system tray menu items
            let show_i = MenuItem::with_id(app, "show", "Open CampusMesh", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide Window", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit CampusMesh", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            // Setup System Tray Icon with left-click toggle & context menu
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("CampusMesh • Decentralized P2P Mesh")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        if let Some(swarm) = app.try_state::<Arc<SwarmSidecarManager>>() {
                            swarm.stop();
                        }
                        if let Some(lan) = app.try_state::<Arc<LanDiscoveryEngine>>() {
                            lan.stop();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_save_message,
            db_get_messages,
            db_save_conversation,
            db_get_conversations,
            db_save_contact,
            db_get_contacts,
            lan_start_discovery,
            lan_broadcast_beacon,
            lan_stop_discovery,
            lan_send_direct,
            swarm_start,
            swarm_command,
            swarm_status,
            swarm_stop,
            simplex_derive_queue_id,
            simplex_derive_safety_number,
            window_alert_incoming_call
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Keep CampusMesh mesh node alive in background on Windows by minimizing to tray
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CampusMesh desktop application");
}
