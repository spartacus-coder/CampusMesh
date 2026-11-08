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
    }
}
