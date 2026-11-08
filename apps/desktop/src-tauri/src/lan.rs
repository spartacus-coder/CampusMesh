use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
pub const MULTICAST_PORT: u16 = 7777;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LanBeacon {
    pub fingerprint: String,
    pub display_name: String,
    pub ip: Option<String>,
    pub port: u16,
    pub timestamp: i64,
}

pub struct LanDiscoveryEngine {
    is_running: Arc<AtomicBool>,
}

impl LanDiscoveryEngine {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app_handle: AppHandle, local_fingerprint: String) -> Result<(), String> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        let is_running = self.is_running.clone();
        thread::spawn(move || {
            let bind_addr = SocketAddr::from(([0, 0, 0, 0], MULTICAST_PORT));
            let socket = match UdpSocket::bind(bind_addr) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[CampusMesh LAN] Failed to bind UDP multicast socket: {e}");
                    is_running.store(false, Ordering::SeqCst);
                    return;
                }
            };

            let _ = socket.join_multicast_v4(&MULTICAST_ADDR, &Ipv4Addr::UNSPECIFIED);
            let _ = socket.set_read_timeout(Some(Duration::from_millis(800)));

            let mut buf = [0u8; 2048];
            while is_running.load(Ordering::SeqCst) {
                if let Ok((len, src)) = socket.recv_from(&mut buf) {
                    if let Ok(text) = std::str::from_utf8(&buf[..len]) {
                        if let Ok(mut beacon) = serde_json::from_str::<LanBeacon>(text) {
                            if beacon.fingerprint != local_fingerprint {
                                beacon.ip = Some(src.ip().to_string());
                                let _ = app_handle.emit("lan-peer-discovered", &beacon);
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub fn broadcast(&self, beacon: LanBeacon) -> Result<(), String> {
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.set_broadcast(true).map_err(|e| e.to_string())?;
        let target = SocketAddr::from((MULTICAST_ADDR, MULTICAST_PORT));
        let data = serde_json::to_vec(&beacon).map_err(|e| e.to_string())?;
        socket.send_to(&data, target).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}

