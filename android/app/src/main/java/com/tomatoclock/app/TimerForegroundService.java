package com.tomatoclock.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class TimerForegroundService extends Service {

    private static final int NOTIFICATION_ID = 1001;
    private static final String CHANNEL_ID = "timer_foreground";

    private static final String ACTION_START = "com.tomatoclock.action.START_TIMER";
    private static final String ACTION_STOP = "com.tomatoclock.action.STOP_TIMER";
    private static final String ACTION_UPDATE = "com.tomatoclock.action.UPDATE_TIMER";

    private static String currentTime = "00:00:00";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            currentTime = intent.getStringExtra("time");
            if (currentTime == null) currentTime = "00:00:00";
            startForeground(NOTIFICATION_ID, buildNotification(currentTime));
        } else if (ACTION_UPDATE.equals(action)) {
            String time = intent.getStringExtra("time");
            if (time != null) {
                currentTime = time;
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                nm.notify(NOTIFICATION_ID, buildNotification(currentTime));
            }
        } else if (ACTION_STOP.equals(action)) {
            stopSelf();
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification(String time) {
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("西续猆 正在计时")
                .setContentText(time)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "记时服务",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("无声通知，持续显示记时状态");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(channel);
        }
    }

    public static void start(Context context, String time) {
        Intent intent = new Intent(context, TimerForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("time", time);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void update(Context context, String time) {
        Intent intent = new Intent(context, TimerForegroundService.class);
        intent.setAction(ACTION_UPDATE);
        intent.putExtra("time", time);
        context.startService(intent);
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, TimerForegroundService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }
}
