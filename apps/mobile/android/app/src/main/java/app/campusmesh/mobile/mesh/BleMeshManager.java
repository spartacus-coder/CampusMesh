package app.campusmesh.mobile.mesh;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Ultra-low-power, air-gapped Bluetooth Low Energy (BLE) Mesh Manager.
 * Operates with 0 Wi-Fi and 0 cellular data, allowing students to exchange
 * encrypted text packets directly via BLE advertisements and GATT characteristics.
 */
public class BleMeshManager {
    private static final String TAG = "CampusMeshBle";

    // Dedicated 16-bit UUID alias for CampusMesh air-gapped discovery
    public static final UUID SERVICE_UUID = UUID.fromString("0000fe2c-0000-1000-8000-00805f9b34fb");
    public static final UUID CHARACTERISTIC_UUID = UUID.fromString("0000fe2d-0000-1000-8000-00805f9b34fb");

    public interface BleMeshListener {
        void onPeerDiscovered(String deviceAddress, String deviceName, String fingerprintHash, int rssi);
        void onMessageReceived(String message, String senderAddress);
        void onError(String error);
    }

    private final Context context;
    private final BluetoothManager bluetoothManager;
    private final BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothLeAdvertiser bleAdvertiser;
    private BluetoothGattServer gattServer;
    private BleMeshListener listener;

    private boolean isScanning = false;
    private boolean isAdvertising = false;

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            super.onScanResult(callbackType, result);
            handleScanResult(result);
        }

        @Override
        public void onBatchScanResults(List<ScanResult> results) {
            super.onBatchScanResults(results);
            for (ScanResult r : results) {
                handleScanResult(r);
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            super.onScanFailed(errorCode);
            Log.w(TAG, "BLE scan failed with error code: " + errorCode);
            if (listener != null) listener.onError("BLE scan failed (code " + errorCode + ")");
        }
    };

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            super.onStartSuccess(settingsInEffect);
            isAdvertising = true;
            Log.i(TAG, "BLE mesh advertisement broadcasting successfully");
        }

        @Override
        public void onStartFailure(int errorCode) {
            super.onStartFailure(errorCode);
            isAdvertising = false;
            Log.w(TAG, "BLE advertisement failed: " + errorCode);
            if (listener != null) listener.onError("BLE advertising failed (code " + errorCode + ")");
        }
    };

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                                                 BluetoothGattCharacteristic characteristic,
                                                 boolean preparedWrite, boolean responseNeeded,
                                                 int offset, byte[] value) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value);

            if (CHARACTERISTIC_UUID.equals(characteristic.getUuid()) && value != null) {
                String message = new String(value, StandardCharsets.UTF_8);
                Log.d(TAG, "Received BLE message packet from " + device.getAddress() + ": " + message.length() + " chars");

                if (listener != null) {
                    listener.onMessageReceived(message, device.getAddress());
                }
            }

            if (responseNeeded && gattServer != null) {
                try {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
                } catch (SecurityException ignored) {}
            }
        }
    };

    public BleMeshManager(Context context) {
        this.context = context.getApplicationContext();
        this.bluetoothManager = (BluetoothManager) this.context.getSystemService(Context.BLUETOOTH_SERVICE);
        this.bluetoothAdapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
    }

    public void setListener(BleMeshListener listener) {
        this.listener = listener;
    }

    public boolean isSupported() {
        return bluetoothAdapter != null;
    }

    public boolean isEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    public void startScan() {
        if (!isEnabled()) {
            if (listener != null) listener.onError("Bluetooth is disabled");
            return;
        }

        bleScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bleScanner == null) {
            if (listener != null) listener.onError("Bluetooth LE Scanner not available");
            return;
        }

        try {
            startGattServer();

            List<ScanFilter> filters = new ArrayList<>();
            filters.add(new ScanFilter.Builder()
                    .setServiceUuid(new ParcelUuid(SERVICE_UUID))
                    .build());

            ScanSettings settings = new ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .build();

            bleScanner.startScan(filters, settings, scanCallback);
            isScanning = true;
            Log.i(TAG, "BLE mesh scan active for UUID: " + SERVICE_UUID);
        } catch (SecurityException e) {
            Log.e(TAG, "Missing Bluetooth Scan permissions", e);
            if (listener != null) listener.onError("Missing BLUETOOTH_SCAN permission");
        }
    }

    public void stopScan() {
        if (bleScanner != null && isScanning) {
            try {
                bleScanner.stopScan(scanCallback);
            } catch (Exception ignored) {}
            isScanning = false;
        }
    }

    public void startAdvertising(String localFingerprint, String displayName) {
        if (!isEnabled()) return;

        bleAdvertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        if (bleAdvertiser == null) {
            Log.w(TAG, "BLE Advertiser not supported on this device hardware");
            return;
        }

        try {
            startGattServer();

            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                    .setConnectable(true)
                    .build();

            // Truncate fingerprint to 8-character compact hash for BLE service data
            String fpHash = (localFingerprint != null && localFingerprint.length() >= 8)
                    ? localFingerprint.substring(0, 8)
                    : "cm_peer";
            byte[] serviceData = fpHash.getBytes(StandardCharsets.UTF_8);

            AdvertiseData data = new AdvertiseData.Builder()
                    .setIncludeDeviceName(false)
                    .setIncludeTxPowerLevel(false)
                    .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                    .addServiceData(new ParcelUuid(SERVICE_UUID), serviceData)
                    .build();

            bleAdvertiser.startAdvertising(settings, data, advertiseCallback);
        } catch (SecurityException e) {
            Log.e(TAG, "Missing BLUETOOTH_ADVERTISE permission", e);
        }
    }

    public void stopAdvertising() {
        if (bleAdvertiser != null && isAdvertising) {
            try {
                bleAdvertiser.stopAdvertising(advertiseCallback);
            } catch (Exception ignored) {}
            isAdvertising = false;
        }
    }

    public void sendMessage(String remoteDeviceAddress, String message) {
        if (!isEnabled() || remoteDeviceAddress == null) return;

        try {
            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(remoteDeviceAddress);
            if (device == null) return;

            device.connectGatt(context, false, new BluetoothGattCallback() {
                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        try {
                            gatt.discoverServices();
                        } catch (SecurityException ignored) {}
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        try { gatt.close(); } catch (Exception ignored) {}
                    }
                }

                @Override
                public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        BluetoothGattService service = gatt.getService(SERVICE_UUID);
                        if (service != null) {
                            BluetoothGattCharacteristic characteristic = service.getCharacteristic(CHARACTERISTIC_UUID);
                            if (characteristic != null) {
                                byte[] payload = message.getBytes(StandardCharsets.UTF_8);
                                characteristic.setValue(payload);
                                try {
                                    gatt.writeCharacteristic(characteristic);
                                } catch (SecurityException ignored) {}
                            }
                        }
                    }
                }

                @Override
                public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    try {
                        gatt.disconnect();
                        gatt.close();
                    } catch (Exception ignored) {}
                }
            });
        } catch (SecurityException ignored) {}
    }

    private void handleScanResult(ScanResult result) {
        if (result == null || result.getDevice() == null) return;

        BluetoothDevice device = result.getDevice();
        int rssi = result.getRssi();
        ScanRecord record = result.getScanRecord();

        String fpHash = "";
        if (record != null) {
            byte[] serviceData = record.getServiceData(new ParcelUuid(SERVICE_UUID));
            if (serviceData != null) {
                fpHash = new String(serviceData, StandardCharsets.UTF_8);
            }
        }

        String name = "";
        try {
            name = device.getName();
        } catch (SecurityException ignored) {}
        if (name == null || name.isEmpty()) {
            name = "CampusMesh BLE Peer";
        }

        if (listener != null) {
            listener.onPeerDiscovered(device.getAddress(), name, fpHash, rssi);
        }
    }

    private synchronized void startGattServer() {
        if (gattServer != null || bluetoothManager == null) return;

        try {
            gattServer = bluetoothManager.openGattServer(context, gattServerCallback);
            if (gattServer == null) return;

            BluetoothGattService service = new BluetoothGattService(
                    SERVICE_UUID,
                    BluetoothGattService.SERVICE_TYPE_PRIMARY
            );

            BluetoothGattCharacteristic characteristic = new BluetoothGattCharacteristic(
                    CHARACTERISTIC_UUID,
                    BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_READ | BluetoothGattCharacteristic.PERMISSION_WRITE
            );

            service.addCharacteristic(characteristic);
            gattServer.addService(service);
            Log.i(TAG, "GATT Server registered with CampusMesh BLE service");
        } catch (SecurityException ignored) {}
    }

    public void destroy() {
        stopScan();
        stopAdvertising();
        if (gattServer != null) {
            try {
                gattServer.close();
            } catch (Exception ignored) {}
            gattServer = null;
        }
    }
}

