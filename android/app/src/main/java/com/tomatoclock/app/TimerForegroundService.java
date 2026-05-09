package com.tomatoclock.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

public class TimerForegroundService extends Service {

    private static final int FG_NOTIFICATION_ID = 1001;
    private static final int COMPLETE_NOTIFICATION_ID = 1002;
    private static final String CHANNEL_FG = "timer_foreground";
    private static final String CHANNEL_COMPLETE = "timer_complete";

    private static final String EXTRA_MODE = "timer_mode";

    private Handler handler;
    private String timerMode;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String mode = intent.getStringExtra(EXTRA_MODE);
        if ("up".equals(mode)) {
            timerMode = "up";
            startForeground(FG_NOTIFICATION_ID, fgNotification("正向计时中"));
        } else if ("down".equals(mode)) {
            timerMode = "down";
            startForeground(FG_NOTIFICATION_ID, fgNotification("倒计时中"));
            startCountdownCheck();
        } else if ("stop".equals(mode)) {
            stopCountdownCheck();
            stopSelf();
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startCountdownCheck() {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (!"down".equals(timerMode)) return;

                // Use TimerPlugin static fields so pause/resume adjustments are respected
                long elapsed = (System.currentTimeMillis() - TimerPlugin.startTimeMillis) / 1000;
                long totalSec = TimerPlugin.totalSeconds;
                long remaining = totalSec - elapsed;

                if (remaining > 0) {
                    String timeStr = fmtCountdown(remaining);
                    NotificationManager nm = getSystemService(NotificationManager.class);
                    nm.notify(FG_NOTIFICATION_ID, fgNotification("剩余 " + timeStr));
                    handler.postDelayed(this, 1000);
                } else {
                    timerMode = null;
                    TimerPlugin.timerRunning = false;
                    TimerPlugin.timerType = null;
                    TimerPlugin.timerCompleted = true;
                    showCompletionNotification();
                    stopSelf();
                }
            }
        });
    }

    private void stopCountdownCheck() {
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
    }

    private void showCompletionNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_COMPLETE)
                .setContentTitle("倒计时完成")
                .setContentText("番茄钟倒计时结束了！")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setDefaults(Notification.DEFAULT_ALL)
                .build();

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                nm.notify(COMPLETE_NOTIFICATION_ID, notification);
            }
        } else {
            nm.notify(COMPLETE_NOTIFICATION_ID, notification);
        }
    }

    private Notification fgNotification(String text) {
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_FG)
                .setContentTitle("番茄钟")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .setContentIntent(pi)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);

            NotificationChannel fg = new NotificationChannel(
                    CHANNEL_FG, "计时服务", NotificationManager.IMPORTANCE_LOW);
            fg.setDescription("持续显示计时状态，无声");
            fg.setShowBadge(false);
            nm.createNotificationChannel(fg);

            NotificationChannel complete = new NotificationChannel(
                    CHANNEL_COMPLETE, "计时完成", NotificationManager.IMPORTANCE_HIGH);
            complete.setDescription("倒计时结束时通知");
            complete.enableVibration(true);
            nm.createNotificationChannel(complete);
        }
    }

    private static String fmtCountdown(long s) {
        long m = s / 60, sec = s % 60;
        return String.format("%02d:%02d", m, sec);
    }

    public static void startForUp(Context context) {
        Intent i = new Intent(context, TimerForegroundService.class);
        i.putExtra(EXTRA_MODE, "up");
        start(context, i);
    }

    public static void startForDown(Context context, long totalSeconds) {
        Intent i = new Intent(context, TimerForegroundService.class);
        i.putExtra(EXTRA_MODE, "down");
        start(context, i);
    }

    public static void stop(Context context) {
        Intent i = new Intent(context, TimerForegroundService.class);
        i.putExtra(EXTRA_MODE, "stop");
        context.startService(i);
    }

    private static void start(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }
}
