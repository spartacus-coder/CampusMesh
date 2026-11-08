package app.campusmesh.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import app.campusmesh.mobile.services.MeshForegroundService;

@CapacitorPlugin(name = "CampusMeshNative")
public class CampusMeshNativePlugin extends Plugin {
    public static final String MSG_CHANNEL_ID = "campusmesh_incoming_messages";
    private static int msgNotificationId = 8800;

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
                msgNotificationId,
                notifyIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                    : PendingIntent.FLAG_UPDATE_CURRENT
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MSG_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(msgNotificationId++, builder.build());
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to show native notification: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void triggerHaptic(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vibratorManager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vibratorManager != null) {
                    Vibrator vibrator = vibratorManager.getDefaultVibrator();
                    vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK));
                }
            } else {
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(35);
                    }
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Haptic failed: " + e.getMessage());
        }
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
}
