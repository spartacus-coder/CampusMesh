package app.campusmesh.mobile;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.campusmesh.mobile.services.MeshForegroundService;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CampusMeshNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Auto-start mesh foreground service to maintain 24/7 background peer connection
        try {
            Intent serviceIntent = new Intent(this, MeshForegroundService.class);
            serviceIntent.setAction(MeshForegroundService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            // Log or ignore if background restrictions apply before user interaction
        }

        // Request runtime media permissions for WebRTC Voice & Video calls
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = {
                android.Manifest.permission.RECORD_AUDIO,
                android.Manifest.permission.CAMERA
            };
            boolean needsRequest = false;
            for (String p : permissions) {
                if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    needsRequest = true;
                    break;
                }
            }
            if (needsRequest) {
                requestPermissions(permissions, 101);
            }
        }

        // Enable media playback without requiring initial user gestures for incoming call ringers & audio streams
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {}
    }
}
