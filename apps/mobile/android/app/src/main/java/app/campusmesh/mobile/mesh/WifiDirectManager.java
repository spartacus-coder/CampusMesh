package app.campusmesh.mobile.mesh;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.NetworkInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pInfo;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;
import android.os.Looper;
import android.util.Log;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * High-Speed Air-Gapped Wi-Fi Direct (P2P) Manager.
 * Operates without any campus router or cellular internet, allowing direct
 * 50-250 Mbps mesh communication between Android devices.
 */
public class WifiDirectManager {
    private static final String TAG = "CampusMeshWifiDirect";
    public static final int P2P_SOCKET_PORT = 8888;

    public interface WifiDirectListener {
        void onPeersUpdated(List<WifiP2pDevice> peers);
        void onConnectionChanged(boolean isConnected, boolean isGroupOwner, String groupOwnerAddress);
        void onMessageReceived(String message, String remoteAddress);
        void onError(String message);
    }

    private final Context context;
    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;
    private WifiDirectListener listener;

    private boolean isReceiverRegistered = false;
    private final List<WifiP2pDevice> discoveredPeers = new ArrayList<>();
    private WifiP2pInfo currentConnectionInfo;

    private ServerSocket serverSocket;
    private Socket clientSocket;
    private final List<Socket> connectedClients = new ArrayList<>();
    private final ExecutorService networkExecutor = Executors.newCachedThreadPool();
    private volatile boolean isRunning = false;

    private final BroadcastReceiver p2pReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            String action = intent.getAction();
            if (WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION.equals(action)) {
                int state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1);
                boolean isEnabled = state == WifiP2pManager.WIFI_P2P_STATE_ENABLED;
                Log.d(TAG, "Wi-Fi P2P state changed: " + (isEnabled ? "ENABLED" : "DISABLED"));
            } else if (WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(action)) {
                requestPeers();
            } else if (WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(action)) {
                NetworkInfo networkInfo = intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO);
                if (networkInfo != null && networkInfo.isConnected()) {
                    requestConnectionInfo();
                } else {
                    handleDisconnected();
                }
            } else if (WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION.equals(action)) {
                WifiP2pDevice device = intent.getParcelableExtra(WifiP2pManager.EXTRA_WIFI_P2P_DEVICE);
                if (device != null) {
                    Log.d(TAG, "This device: " + device.deviceName + " (" + device.deviceAddress + ")");
                }
            }
        }
    };

    public WifiDirectManager(Context context) {
        this.context = context.getApplicationContext();
        this.manager = (WifiP2pManager) this.context.getSystemService(Context.WIFI_P2P_SERVICE);
        if (manager != null) {
            this.channel = manager.initialize(this.context, Looper.getMainLooper(), null);
        } else {
            this.channel = null;
        }
    }

    public void setListener(WifiDirectListener listener) {
        this.listener = listener;
    }

    public void startDiscovery() {
        if (manager == null || channel == null) {
            if (listener != null) listener.onError("Wi-Fi P2P is not supported on this device");
            return;
        }

        registerReceiver();
        isRunning = true;

        try {
            manager.discoverPeers(channel, new WifiP2pManager.ActionListener() {
                @Override
                public void onSuccess() {
                    Log.i(TAG, "Wi-Fi Direct peer discovery started successfully");
                }

                @Override
                public void onFailure(int reason) {
                    Log.w(TAG, "Wi-Fi Direct peer discovery failed with reason: " + reason);
                    if (listener != null) listener.onError("Failed to start peer discovery: code " + reason);
                }
            });
        } catch (SecurityException e) {
            Log.e(TAG, "Missing Wi-Fi Direct permissions", e);
            if (listener != null) listener.onError("Missing required permissions for Wi-Fi Direct");
        }
    }

    public void stopDiscovery() {
        isRunning = false;
        if (manager != null && channel != null) {
            try {
                manager.stopPeerDiscovery(channel, null);
            } catch (Exception ignored) {}
        }
        unregisterReceiver();
        closeSockets();
    }

    public void connect(String deviceAddress) {
        if (manager == null || channel == null) return;

        WifiP2pConfig config = new WifiP2pConfig();
        config.deviceAddress = deviceAddress;

        try {
            manager.connect(channel, config, new WifiP2pManager.ActionListener() {
                @Override
                public void onSuccess() {
                    Log.i(TAG, "Initiated connection to peer: " + deviceAddress);
                }

                @Override
                public void onFailure(int reason) {
                    Log.w(TAG, "Connection initiation failed: " + reason);
                    if (listener != null) listener.onError("Failed to connect to " + deviceAddress + " (code " + reason + ")");
                }
            });
        } catch (SecurityException e) {
            if (listener != null) listener.onError("SecurityException connecting to peer: " + e.getMessage());
        }
    }

    public void disconnect() {
        if (manager != null && channel != null) {
            try {
                manager.removeGroup(channel, new WifiP2pManager.ActionListener() {
                    @Override
                    public void onSuccess() {
                        Log.i(TAG, "Wi-Fi Direct group removed");
                    }

                    @Override
                    public void onFailure(int reason) {
                        Log.w(TAG, "Failed to remove group: " + reason);
                    }
                });
            } catch (Exception ignored) {}
        }
        handleDisconnected();
    }

    public void sendMessage(String message) {
        networkExecutor.execute(() -> {
            byte[] data = (message + "\n").getBytes(StandardCharsets.UTF_8);

            // If we are Group Owner, send to all connected clients
            synchronized (connectedClients) {
                for (Socket sock : connectedClients) {
                    if (sock != null && !sock.isClosed() && sock.isConnected()) {
                        try {
                            sock.getOutputStream().write(data);
                            sock.getOutputStream().flush();
                        } catch (Exception e) {
                            Log.w(TAG, "Failed to send message to client socket", e);
                        }
                    }
                }
            }

            // If we are client, send to Group Owner server
            if (clientSocket != null && !clientSocket.isClosed() && clientSocket.isConnected()) {
                try {
                    clientSocket.getOutputStream().write(data);
                    clientSocket.getOutputStream().flush();
                } catch (Exception e) {
                    Log.w(TAG, "Failed to send message to group owner socket", e);
                }
            }
        });
    }

    private void requestPeers() {
        if (manager == null || channel == null) return;
        try {
            manager.requestPeers(channel, new WifiP2pManager.PeerListListener() {
                @Override
                public void onPeersAvailable(WifiP2pDeviceList peerList) {
                    discoveredPeers.clear();
                    if (peerList != null) {
                        Collection<WifiP2pDevice> deviceList = peerList.getDeviceList();
                        discoveredPeers.addAll(deviceList);
                    }
                    if (listener != null) {
                        listener.onPeersUpdated(new ArrayList<>(discoveredPeers));
                    }
                }
            });
        } catch (SecurityException ignored) {}
    }

    private void requestConnectionInfo() {
        if (manager == null || channel == null) return;
        manager.requestConnectionInfo(channel, info -> {
            currentConnectionInfo = info;
            boolean isGroupOwner = info != null && info.isGroupOwner;
            String ownerAddress = (info != null && info.groupOwnerAddress != null)
                    ? info.groupOwnerAddress.getHostAddress()
                    : "";

            Log.i(TAG, "Connection established. Group Owner: " + isGroupOwner + ", Host: " + ownerAddress);

            if (listener != null) {
                listener.onConnectionChanged(true, isGroupOwner, ownerAddress);
            }

            if (info != null && info.groupFormed) {
                if (isGroupOwner) {
                    startServer();
                } else if (!ownerAddress.isEmpty()) {
                    startClient(ownerAddress);
                }
            }
        });
    }

    private void startServer() {
        closeSockets();
        networkExecutor.execute(() -> {
            try {
                serverSocket = new ServerSocket(P2P_SOCKET_PORT);
                Log.i(TAG, "Wi-Fi Direct Group Owner listening on port " + P2P_SOCKET_PORT);

                while (isRunning && !serverSocket.isClosed()) {
                    Socket socket = serverSocket.accept();
                    synchronized (connectedClients) {
                        connectedClients.add(socket);
                    }
                    listenToSocket(socket);
                }
            } catch (Exception e) {
                if (isRunning) Log.w(TAG, "Server socket closed or error: " + e.getMessage());
            }
        });
    }

    private void startClient(String hostAddress) {
        closeSockets();
        networkExecutor.execute(() -> {
            int retries = 5;
            while (retries > 0 && isRunning) {
                try {
                    clientSocket = new Socket();
                    clientSocket.bind(null);
                    clientSocket.connect(new InetSocketAddress(hostAddress, P2P_SOCKET_PORT), 5000);
                    Log.i(TAG, "Connected to Wi-Fi Direct Group Owner at " + hostAddress + ":" + P2P_SOCKET_PORT);
                    listenToSocket(clientSocket);
                    break;
                } catch (Exception e) {
                    retries--;
                    Log.d(TAG, "Retrying socket connection to Group Owner (" + retries + " left): " + e.getMessage());
                    try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
                }
            }
        });
    }

    private void listenToSocket(Socket socket) {
        networkExecutor.execute(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                String remoteAddr = socket.getInetAddress() != null
                        ? socket.getInetAddress().getHostAddress()
                        : "unknown";

                while (isRunning && (line = reader.readLine()) != null) {
                    if (listener != null) {
                        listener.onMessageReceived(line, remoteAddr);
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "Socket reader closed: " + e.getMessage());
            } finally {
                synchronized (connectedClients) {
                    connectedClients.remove(socket);
                }
                try { socket.close(); } catch (Exception ignored) {}
            }
        });
    }

    private void handleDisconnected() {
        closeSockets();
        currentConnectionInfo = null;
        if (listener != null) {
            listener.onConnectionChanged(false, false, "");
        }
    }

    private void closeSockets() {
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (Exception ignored) {}

        try {
            if (clientSocket != null && !clientSocket.isClosed()) {
                clientSocket.close();
            }
        } catch (Exception ignored) {}

        synchronized (connectedClients) {
            for (Socket s : connectedClients) {
                try { s.close(); } catch (Exception ignored) {}
            }
            connectedClients.clear();
        }
    }

    private void registerReceiver() {
        if (!isReceiverRegistered) {
            IntentFilter intentFilter = new IntentFilter();
            intentFilter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
            intentFilter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
            intentFilter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
            intentFilter.addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(p2pReceiver, intentFilter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                context.registerReceiver(p2pReceiver, intentFilter);
            }
            isReceiverRegistered = true;
        }
    }

    private void unregisterReceiver() {
        if (isReceiverRegistered) {
            try {
                context.unregisterReceiver(p2pReceiver);
            } catch (Exception ignored) {}
            isReceiverRegistered = false;
        }
    }
}

