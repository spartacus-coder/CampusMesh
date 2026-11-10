use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
pub const MULTICAST_PORT: u16 = 7777;
pub const DEFAULT_LAN_TCP_PORT: u16 = 7778;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LanBeacon {
    pub fingerprint: String,
    pub display_name: String,
    pub ip: Option<String>,
    pub port: u16,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LanDirectMessageEvent {
    pub payload: String,
    pub remote_ip: String,
}

pub struct LanDiscoveryEngine {
    is_running: Arc<AtomicBool>,
    tcp_port: Arc<AtomicU16>,
}

impl LanDiscoveryEngine {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            tcp_port: Arc::new(AtomicU16::new(0)),
        }
    }

    pub fn start(&self, app_handle: AppHandle, local_fingerprint: String) -> Result<(), String> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        // 1. Bind Direct LAN TCP Socket (port 7778 preferred, fallback ephemeral)
        let tcp_listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], DEFAULT_LAN_TCP_PORT)))
            .or_else(|_| TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], 0))));

        match tcp_listener {
            Ok(listener) => {
                let bound_port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
                self.tcp_port.store(bound_port, Ordering::SeqCst);
                let _ = listener.set_nonblocking(true);

                let tcp_running = self.is_running.clone();
                let tcp_app = app_handle.clone();
                thread::spawn(move || {
                    while tcp_running.load(Ordering::SeqCst) {
                        match listener.accept() {
                            Ok((stream, remote_addr)) => {
                                let conn_app = tcp_app.clone();
                                let ip_str = remote_addr.ip().to_string();
                                thread::spawn(move || {
                                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                                    let reader = BufReader::new(stream);
                                    for line in reader.lines().map_while(Result::ok) {
                                        let trimmed = line.trim();
                                        if !trimmed.is_empty() {
                                            let _ = conn_app.emit(
                                                "lan-direct-message",
                                                LanDirectMessageEvent {
                                                    payload: trimmed.to_string(),
                                                    remote_ip: ip_str.clone(),
                                                },
                                            );
                                        }
                                    }
                                });
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                thread::sleep(Duration::from_millis(60));
                            }
                            Err(_) => {
                                thread::sleep(Duration::from_millis(200));
                            }
                        }
                    }
                });
            }
            Err(e) => {
                eprintln!("[CampusMesh LAN] Direct TCP listener unavailable: {e}");
            }
        }

        // 2. Start UDP Multicast Beacon Discovery Loop
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

    pub fn broadcast(&self, mut beacon: LanBeacon) -> Result<(), String> {
        let active_tcp = self.tcp_port.load(Ordering::SeqCst);
        if active_tcp > 0 {
            beacon.port = active_tcp;
        }
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.set_broadcast(true).map_err(|e| e.to_string())?;
        let target = SocketAddr::from((MULTICAST_ADDR, MULTICAST_PORT));
        let data = serde_json::to_vec(&beacon).map_err(|e| e.to_string())?;
        socket.send_to(&data, target).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn send_direct(&self, ip: &str, port: u16, payload: &str) -> Result<(), String> {
        let addr_str = format!("{ip}:{port}");
        let addr: SocketAddr = addr_str
            .parse()
            .map_err(|e| format!("Invalid LAN peer socket address '{addr_str}': {e}"))?;
        let mut stream =
            TcpStream::connect_timeout(&addr, Duration::from_secs(3)).map_err(|e| e.to_string())?;
        let line = format!("{payload}\n");
        stream
            .write_all(line.as_bytes())
            .and_then(|_| stream.flush())
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.tcp_port.store(0, Ordering::SeqCst);
    }
}
