package app.campusmesh.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.net.wifi.p2p.WifiP2pDevice;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import app.campusmesh.mobile.mesh.BleMeshManager;
import app.campusmesh.mobile.mesh.WifiDirectManager;
import app.campusmesh.mobile.security.KeystoreManager;
import app.campusmesh.mobile.services.MeshForegroundService;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.List;

@CapacitorPlugin(name = "CampusMeshNative")
public class CampusMeshNativePlugin extends Plugin {
    public static final String MSG_CHANNEL_ID = "campusmesh_incoming_messages";
    public static final String MULTICAST_IP = "239.255.255.250";
    public static final int MULTICAST_PORT = 7777;
    public static final int DEFAULT_LAN_TCP_PORT = 7778;

    private static int msgNotificationId = 8800;
    private WifiManager.MulticastLock multicastLock;
    private MulticastSocket multicastSocket;
    private ServerSocket lanServerSocket;
    private Thread lanListenerThread;
    private Thread lanTcpAcceptThread;
    private volatile int lanTcpPort = 0;
    private volatile boolean isLanRunning = false;

    private WifiDirectManager wifiDirectManager;
    private BleMeshManager bleMeshManager;

    @Override
    public void load() {
        super.load();
        initWifiDirect();
        initBleMesh();
    }

    private synchronized void initWifiDirect() {
        if (wifiDirectManager == null) {
            wifiDirectManager = new WifiDirectManager(getContext());
            wifiDirectManager.setListener(new WifiDirectManager.WifiDirectListener() {
                @Override
                public void onPeersUpdated(List<WifiP2pDevice> peers) {
                    JSArray arr = new JSArray();
                    for (WifiP2pDevice d : peers) {
                        JSObject obj = new JSObject();
                        obj.put("deviceAddress", d.deviceAddress);
                        obj.put("deviceName", d.deviceName);
                        obj.put("status", d.status);
                        arr.put(obj);
                    }
                    JSObject event = new JSObject();
                    event.put("peers", arr);
                    notifyListeners("wifiDirectPeersDiscovered", event);
                }

                @Override
                public void onConnectionChanged(boolean isConnected, boolean isGroupOwner, String groupOwnerAddress) {
                    JSObject event = new JSObject();
                    event.put("isConnected", isConnected);
                    event.put("isGroupOwner", isGroupOwner);
                    event.put("groupOwnerAddress", groupOwnerAddress);
                    notifyListeners("wifiDirectConnectionChanged", event);
                }

                @Override
                public void onMessageReceived(String message, String remoteAddress) {
                    JSObject event = new JSObject();
                    event.put("message", message);
                    event.put("remoteAddress", remoteAddress);
                    notifyListeners("wifiDirectMessageReceived", event);
                }

                @Override
                public void onError(String message) {
                    JSObject event = new JSObject();
                    event.put("error", message);
                    notifyListeners("wifiDirectError", event);
                }
            });
        }
    }

    private synchronized void initBleMesh() {
        if (bleMeshManager == null) {
            bleMeshManager = new BleMeshManager(getContext());
            bleMeshManager.setListener(new BleMeshManager.BleMeshListener() {
                @Override
                public void onPeerDiscovered(String deviceAddress, String deviceName, String fingerprintHash, int rssi) {
                    JSObject event = new JSObject();
                    event.put("deviceAddress", deviceAddress);
                    event.put("deviceName", deviceName);
                    event.put("fingerprintHash", fingerprintHash);
                    event.put("rssi", rssi);
                    notifyListeners("blePeerDiscovered", event);
                }

                @Override
                public void onMessageReceived(String message, String senderAddress) {
                    JSObject event = new JSObject();
                    event.put("message", message);
                    event.put("senderAddress", senderAddress);
                    notifyListeners("bleMessageReceived", event);
                }

                @Override
                public void onError(String error) {
                    JSObject event = new JSObject();
                    event.put("error", error);
                    notifyListeners("bleError", event);
                }
            });
        }
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, MeshForegroundService.class);
            intent.setAction(MeshForegroundService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }

            JSObject ret = new JSObject();
            ret.put("status", "started");
            ret.put("isRunning", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start MeshForegroundService: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, MeshForegroundService.class);
            intent.setAction(MeshForegroundService.ACTION_STOP);
            context.startService(intent);

            JSObject ret = new JSObject();
            ret.put("status", "stopped");
            ret.put("isRunning", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop MeshForegroundService: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isServiceRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isRunning", MeshForegroundService.isServiceRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        String title = call.getString("title", "CampusMesh Message");
        String body = call.getString("body", "You received an encrypted message");
        String conversationId = call.getString("conversationId", "");

        try {
            Context context = getContext();
            createMessageNotificationChannel(context);

            Intent notifyIntent = new Intent(context, MainActivity.class);
            notifyIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (conversationId != null && !conversationId.isEmpty()) {
                notifyIntent.putExtra("conversationId", conversationId);
            }

            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                (int) System.currentTimeMillis(),
                notifyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MSG_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(msgNotificationId++, builder.build());
            }

            JSObject ret = new JSObject();
            ret.put("status", "notified");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to post notification: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void triggerHaptic(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vibratorManager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vibratorManager != null) {
                    vibratorManager.getDefaultVibrator().vibrate(
                        VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                    );
                }
            } else {
                Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(40);
                    }
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void startLanDiscovery(PluginCall call) {
        if (isLanRunning) {
            JSObject ret = new JSObject();
            ret.put("status", "already_running");
            call.resolve(ret);
            return;
        }

        try {
            Context context = getContext();
            WifiManager wifi = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("CampusMeshMulticastLock");
                multicastLock.setReferenceCounted(true);
                multicastLock.acquire();
            }

            multicastSocket = new MulticastSocket(MULTICAST_PORT);
            InetAddress group = InetAddress.getByName(MULTICAST_IP);
            multicastSocket.joinGroup(group);
            isLanRunning = true;

            // Start direct LAN TCP receiver for zero-cloud <5ms peer messaging
            try {
                try {
                    lanServerSocket = new ServerSocket(DEFAULT_LAN_TCP_PORT);
                } catch (Exception portInUse) {
                    lanServerSocket = new ServerSocket(0);
                }
                lanTcpPort = lanServerSocket.getLocalPort();
                lanTcpAcceptThread = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        while (isLanRunning && lanServerSocket != null && !lanServerSocket.isClosed()) {
                            try {
                                final Socket conn = lanServerSocket.accept();
                                final String remoteIp = conn.getInetAddress() != null
                                    ? conn.getInetAddress().getHostAddress()
                                    : "";
                                new Thread(new Runnable() {
                                    @Override
                                    public void run() {
                                        try {
                                            BufferedReader reader = new BufferedReader(
                                                new InputStreamReader(conn.getInputStream(), "UTF-8")
                                            );
                                            String line;
                                            while ((line = reader.readLine()) != null) {
                                                String trimmed = line.trim();
                                                if (!trimmed.isEmpty()) {
                                                    JSObject msgEvt = new JSObject();
                                                    msgEvt.put("payload", trimmed);
                                                    msgEvt.put("remoteIp", remoteIp);
                                                    notifyListeners("lanDirectMessageReceived", msgEvt);
                                                }
                                            }
                                        } catch (Exception ignored) {
                                        } finally {
                                            try { conn.close(); } catch (Exception ignored) {}
                                        }
                                    }
                                }).start();
                            } catch (Exception ignored) {}
                        }
                    }
                });
                lanTcpAcceptThread.start();
            } catch (Exception ignored) {
                lanTcpPort = 0;
            }

            lanListenerThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] buffer = new byte[2048];
                    while (isLanRunning && multicastSocket != null && !multicastSocket.isClosed()) {
                        try {
                            DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                            multicastSocket.receive(packet);

                            String rawJson = new String(packet.getData(), packet.getOffset(), packet.getLength(), "UTF-8");
                            JSONObject obj = new JSONObject(rawJson);

                            if (obj.has("fingerprint")) {
                                JSObject peerEvent = new JSObject();
                                peerEvent.put("fingerprint", obj.getString("fingerprint"));
                                peerEvent.put("displayName", obj.optString("display_name", "Peer"));
                                peerEvent.put("ip", packet.getAddress().getHostAddress());
                                peerEvent.put("port", obj.optInt("port", MULTICAST_PORT));
                                peerEvent.put("timestamp", obj.optLong("timestamp", System.currentTimeMillis()));

                                notifyListeners("lanPeerDiscovered", peerEvent);
                            }
                        } catch (Exception e) {
                            // Socket closed or timeout
                        }
                    }
                }
            });
            lanListenerThread.start();

            JSObject ret = new JSObject();
            ret.put("status", "listening");
            ret.put("tcpPort", lanTcpPort);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start LAN discovery: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void broadcastLanBeacon(PluginCall call) {
        final String fingerprint = call.getString("fingerprint", "");
        final String displayName = call.getString("displayName", "Campus User");
        final int activePort = lanTcpPort > 0 ? lanTcpPort : MULTICAST_PORT;

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("fingerprint", fingerprint);
                    obj.put("display_name", displayName);
                    obj.put("port", activePort);
                    obj.put("timestamp", System.currentTimeMillis());

                    byte[] data = obj.toString().getBytes("UTF-8");
                    InetAddress group = InetAddress.getByName(MULTICAST_IP);
                    DatagramPacket packet = new DatagramPacket(data, data.length, group, MULTICAST_PORT);

                    DatagramSocket sendSocket = new DatagramSocket();
                    sendSocket.setBroadcast(true);
                    sendSocket.send(packet);
                    sendSocket.close();
                } catch (Exception ignored) {}
            }
        }).start();

        call.resolve();
    }

    @PluginMethod
    public void sendLanDirect(final PluginCall call) {
        final String ip = call.getString("ip", "");
        final int port = call.getInt("port", DEFAULT_LAN_TCP_PORT);
        final String payload = call.getString("payload", "");
        if (ip == null || ip.isEmpty() || payload == null || payload.isEmpty()) {
            call.reject("ip and payload are required");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                Socket socket = null;
                try {
                    socket = new Socket();
                    socket.connect(new InetSocketAddress(ip, port), 3000);
                    OutputStreamWriter writer = new OutputStreamWriter(socket.getOutputStream(), "UTF-8");
                    writer.write(payload + "\n");
                    writer.flush();
                    JSObject ret = new JSObject();
                    ret.put("sent", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("LAN direct send failed: " + e.getMessage(), e);
                } finally {
                    if (socket != null) {
                        try { socket.close(); } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void stopLanDiscovery(PluginCall call) {
        isLanRunning = false;
        lanTcpPort = 0;
        try {
            if (lanServerSocket != null && !lanServerSocket.isClosed()) {
                lanServerSocket.close();
            }
            if (multicastSocket != null && !multicastSocket.isClosed()) {
                multicastSocket.close();
            }
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        if (call != null) {
            call.resolve(ret);
        }
    }

    // --- Hardware Keystore Enclave Methods ---

    @PluginMethod
    public void keystoreEncrypt(PluginCall call) {
        String data = call.getString("data", "");
        try {
            String encrypted = KeystoreManager.getInstance().encrypt(data);
            JSObject ret = new JSObject();
            ret.put("encrypted", encrypted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Keystore encryption failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void keystoreDecrypt(PluginCall call) {
        String encrypted = call.getString("encrypted", "");
        try {
            String decrypted = KeystoreManager.getInstance().decrypt(encrypted);
            JSObject ret = new JSObject();
            ret.put("data", decrypted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Keystore decryption failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isHardwareSecurityAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isHardwareBacked", KeystoreManager.getInstance().isHardwareBacked());
        call.resolve(ret);
    }

    // --- Air-Gapped Wi-Fi Direct Methods ---

    @PluginMethod
    public void startWifiDirectDiscovery(PluginCall call) {
        initWifiDirect();
        wifiDirectManager.startDiscovery();
        JSObject ret = new JSObject();
        ret.put("status", "started");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopWifiDirectDiscovery(PluginCall call) {
        if (wifiDirectManager != null) {
            wifiDirectManager.stopDiscovery();
        }
        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        call.resolve(ret);
    }

    @PluginMethod
    public void connectWifiDirect(PluginCall call) {
        String deviceAddress = call.getString("deviceAddress", "");
        if (deviceAddress == null || deviceAddress.isEmpty()) {
            call.reject("Missing deviceAddress parameter");
            return;
        }
        initWifiDirect();
        wifiDirectManager.connect(deviceAddress);
        JSObject ret = new JSObject();
        ret.put("status", "connecting");
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnectWifiDirect(PluginCall call) {
        if (wifiDirectManager != null) {
            wifiDirectManager.disconnect();
        }
        JSObject ret = new JSObject();
        ret.put("status", "disconnected");
        call.resolve(ret);
    }

    @PluginMethod
    public void sendWifiDirectMessage(PluginCall call) {
        String message = call.getString("message", "");
        if (wifiDirectManager != null) {
            wifiDirectManager.sendMessage(message);
        }
        call.resolve();
    }

    // --- Air-Gapped BLE Mesh Methods ---

    @PluginMethod
    public void startBleMesh(PluginCall call) {
        String fingerprint = call.getString("fingerprint", "");
        String displayName = call.getString("displayName", "Campus User");
        initBleMesh();
        bleMeshManager.startScan();
        bleMeshManager.startAdvertising(fingerprint, displayName);
        JSObject ret = new JSObject();
        ret.put("status", "active");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopBleMesh(PluginCall call) {
        if (bleMeshManager != null) {
            bleMeshManager.stopScan();
            bleMeshManager.stopAdvertising();
        }
        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        call.resolve(ret);
    }

    @PluginMethod
    public void sendBleMessage(PluginCall call) {
        String deviceAddress = call.getString("deviceAddress", "");
        String message = call.getString("message", "");
        if (bleMeshManager != null) {
            bleMeshManager.sendMessage(deviceAddress, message);
        }
        call.resolve();
    }

    private void createMessageNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                MSG_CHANNEL_ID,
                "CampusMesh Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Incoming encrypted messages and peer notifications");
            channel.enableVibration(true);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopLanDiscovery(null);
        if (wifiDirectManager != null) {
            wifiDirectManager.stopDiscovery();
        }
        if (bleMeshManager != null) {
            bleMeshManager.destroy();
        }
        super.handleOnDestroy();
    }
}
