use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStatusSnapshot {
    pub running: bool,
    pub available: bool,
    pub runtime_path: Option<String>,
    pub bundle_path: Option<String>,
    pub last_error: Option<String>,
}

pub struct SwarmSidecarManager {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    pending_replies: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>,
    next_id: AtomicU64,
    last_error: Mutex<Option<String>>,
}

impl SwarmSidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            pending_replies: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            last_error: Mutex::new(None),
        }
    }

    fn resolve_runtime_paths(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
        let bin_name = if cfg!(target_os = "windows") {
            "bare.exe"
        } else {
            "bare"
        };

        let mut candidates: Vec<PathBuf> = Vec::new();

        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(dir) = exe_path.parent() {
                candidates.push(dir.join("swarm-runtime"));
            }
        }

        if let Ok(res_dir) = app.path().resolve("swarm-runtime", BaseDirectory::Resource) {
            candidates.push(res_dir);
        }

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("CampusMesh")
                    .join("swarm-runtime"),
            );
        }

        if let Ok(app_data) = app.path().app_data_dir() {
            candidates.push(app_data.join("swarm-runtime"));
        }

        // Development fallback relative to CARGO_MANIFEST_DIR
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("swarm-runtime"));

        for base in candidates {
            let bin = base.join(bin_name);
            let bundle = base.join("swarm.bundle");
            if bin.exists() && bundle.exists() {
                return Some((bin, bundle));
            }
        }

        None
    }

    pub fn status(&self, app: &AppHandle) -> SwarmStatusSnapshot {
        let running = self
            .child
            .lock()
            .ok()
            .map(|g| g.is_some())
            .unwrap_or(false);
        let paths = Self::resolve_runtime_paths(app);
        let last_err = self.last_error.lock().ok().and_then(|g| g.clone());

        SwarmStatusSnapshot {
            running,
            available: paths.is_some(),
            runtime_path: paths.as_ref().map(|(b, _)| b.display().to_string()),
            bundle_path: paths.as_ref().map(|(_, s)| s.display().to_string()),
            last_error: last_err,
        }
    }

    pub fn ensure_started(&self, app: &AppHandle) -> Result<(), String> {
        {
            let mut guard = self.child.lock().map_err(|e| e.to_string())?;
            if let Some(child) = guard.as_mut() {
                if let Ok(None) = child.try_wait() {
                    return Ok(());
                }
                // Process exited previously; clean up stale handle
                *guard = None;
            }
        }

        let (bin_path, bundle_path) = match Self::resolve_runtime_paths(app) {
            Some(p) => p,
            None => {
                let msg = "Holepunch bare runtime sidecar not found in bundle resources; continuing with WebRTC & LAN transport.".to_string();
                if let Ok(mut err_g) = self.last_error.lock() {
                    *err_g = Some(msg.clone());
                }
                return Err(msg);
            }
        };

        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("campusmesh-desktop"))
            .join("swarm_store");
        let _ = std::fs::create_dir_all(&data_dir);

        let mut cmd = Command::new(&bin_path);
        if let Some(parent) = bundle_path.parent() {
            cmd.current_dir(parent);
        }
        cmd.arg(&bundle_path)
            .arg("--data-dir")
            .arg(&data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut spawned = cmd.spawn().map_err(|e| {
            let msg = format!("Failed to launch Holepunch Bare runtime: {e}");
            if let Ok(mut err_g) = self.last_error.lock() {
                *err_g = Some(msg.clone());
            }
            msg
        })?;

        let stdin = spawned
            .stdin
            .take()
            .ok_or_else(|| "Failed capturing sidecar stdin".to_string())?;
        let stdout = spawned
            .stdout
            .take()
            .ok_or_else(|| "Failed capturing sidecar stdout".to_string())?;
        let stderr = spawned.stderr.take();

        if let Ok(mut stdin_g) = self.stdin.lock() {
            *stdin_g = Some(stdin);
        }
        if let Ok(mut child_g) = self.child.lock() {
            *child_g = Some(spawned);
        }
        if let Ok(mut err_g) = self.last_error.lock() {
            *err_g = None;
        }

        let app_handle = app.clone();
        let pending_map = self.pending_replies.clone();

        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                let line = match line_res {
                    Ok(l) => l,
                    Err(_) => break,
                };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                    if let Some(reply_id) = val.get("replyId").and_then(|v| v.as_u64()) {
                        let tx = pending_map
                            .lock()
                            .ok()
                            .and_then(|mut map| map.remove(&reply_id));
                        if let Some(sender) = tx {
                            let _ = sender.send(val);
                        }
                        continue;
                    }

                    if let Some(evt_name) = val.get("event").and_then(|v| v.as_str()) {
                        let _ = app_handle.emit(evt_name, &val);
                    }
                }
            }
        });

        if let Some(err_stream) = stderr {
            thread::spawn(move || {
                let reader = BufReader::new(err_stream);
                for line_res in reader.lines() {
                    if let Ok(line) = line_res {
                        if !line.trim().is_empty() {
                            eprintln!("[CampusMesh Swarm Bare]: {line}");
                        }
                    }
                }
            });
        }

        Ok(())
    }

    pub fn send_command(
        &self,
        app: &AppHandle,
        cmd: &str,
        params: Value,
    ) -> Result<Value, String> {
        self.ensure_started(app)?;

        let req_id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::channel::<Value>();
        {
            let mut map = self.pending_replies.lock().map_err(|e| e.to_string())?;
            map.insert(req_id, tx);
        }

        let payload = json!({
            "id": req_id,
            "cmd": cmd,
            "params": params,
        });

        {
            let mut stdin_g = self.stdin.lock().map_err(|e| e.to_string())?;
            let stdin = stdin_g
                .as_mut()
                .ok_or_else(|| "Swarm sidecar stdin closed".to_string())?;
            let line = format!("{payload}\n");
            if let Err(e) = stdin.write_all(line.as_bytes()).and_then(|_| stdin.flush()) {
                if let Ok(mut map) = self.pending_replies.lock() {
                    map.remove(&req_id);
                }
                return Err(format!("Failed writing to swarm sidecar: {e}"));
            }
        }

        match rx.recv_timeout(Duration::from_secs(20)) {
            Ok(resp) => {
                let ok = resp.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                if ok {
                    Ok(resp.get("result").cloned().unwrap_or(Value::Null))
                } else {
                    let err_msg = resp
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Swarm RPC failed")
                        .to_string();
                    Err(err_msg)
                }
            }
            Err(_) => {
                if let Ok(mut map) = self.pending_replies.lock() {
                    map.remove(&req_id);
                }
                Err(format!("Swarm RPC timeout for command '{cmd}'"))
            }
        }
    }

    pub fn stop(&self) {
        if let Ok(mut stdin_g) = self.stdin.lock() {
            if let Some(mut stdin) = stdin_g.take() {
                let _ = stdin.write_all(b"{\"id\":0,\"cmd\":\"shutdown\"}\n");
                let _ = stdin.flush();
            }
        }
        if let Ok(mut child_g) = self.child.lock() {
            if let Some(mut child) = child_g.take() {
                thread::sleep(Duration::from_millis(120));
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

