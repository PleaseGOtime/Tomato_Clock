package com.tomatoclock.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

public class AndroidBridge {

    private final Activity activity;

    public AndroidBridge(Activity activity) {
        this.activity = activity;
    }

    // ---- Timer State (sync) ----

    @JavascriptInterface
    public String getTimerState() {
        try {
            StringBuilder json = new StringBuilder("{");

            if (TimerPlugin.timerCompleted) {
                json.append("\"type\":\"none\",\"running\":false,\"paused\":false,\"completed\":true");
                TimerPlugin.timerCompleted = false;
            } else if (TimerPlugin.timerPaused) {
                json.append("\"type\":").append(jsonStr(TimerPlugin.timerType));
                json.append(",\"running\":false,\"paused\":true");
                json.append(",\"elapsed\":").append(TimerPlugin.pauseElapsedSeconds);
                json.append(",\"remaining\":").append(Math.max(0, TimerPlugin.totalSeconds - TimerPlugin.pauseElapsedSeconds));
                json.append(",\"total\":").append(TimerPlugin.totalSeconds);
            } else if (TimerPlugin.timerRunning && TimerPlugin.timerType != null) {
                long elapsed = (System.currentTimeMillis() - TimerPlugin.startTimeMillis) / 1000;
                json.append("\"type\":").append(jsonStr(TimerPlugin.timerType));
                json.append(",\"running\":true,\"paused\":false");
                json.append(",\"elapsed\":").append(elapsed);
                if ("down".equals(TimerPlugin.timerType)) {
                    long remaining = Math.max(0, TimerPlugin.totalSeconds - elapsed);
                    json.append(",\"remaining\":").append(remaining);
                    json.append(",\"total\":").append(TimerPlugin.totalSeconds);
                    if (remaining <= 0) {
                        json.append(",\"completed\":true");
                    }
                }
            } else {
                json.append("\"type\":\"none\",\"running\":false,\"paused\":false");
            }

            json.append("}");
            return json.toString();
        } catch (Exception e) {
            return "{\"type\":\"none\",\"running\":false,\"paused\":false}";
        }
    }

    // ---- Timer Controls (fire-and-forget, return void) ----

    @JavascriptInterface
    public void startUpTimer() {
        TimerPlugin.timerCompleted = false;
        TimerPlugin.timerType = "up";
        TimerPlugin.timerRunning = true;
        TimerPlugin.timerPaused = false;
        TimerPlugin.startTimeMillis = System.currentTimeMillis();
        TimerPlugin.totalSeconds = 0;
        TimerPlugin.pauseElapsedSeconds = 0;

        activity.runOnUiThread(() -> TimerForegroundService.startForUp(activity));
    }

    @JavascriptInterface
    public void startDownTimer(long totalSeconds) {
        long sec = totalSeconds > 0 ? totalSeconds : 1500;
        TimerPlugin.timerCompleted = false;
        TimerPlugin.timerType = "down";
        TimerPlugin.timerRunning = true;
        TimerPlugin.timerPaused = false;
        TimerPlugin.startTimeMillis = System.currentTimeMillis();
        TimerPlugin.totalSeconds = sec;
        TimerPlugin.pauseElapsedSeconds = 0;

        activity.runOnUiThread(() -> TimerForegroundService.startForDown(activity, sec));
    }

    @JavascriptInterface
    public void pauseTimer() {
        if (!TimerPlugin.timerRunning || TimerPlugin.timerPaused) return;
        TimerPlugin.timerPaused = true;
        TimerPlugin.pauseElapsedSeconds = (System.currentTimeMillis() - TimerPlugin.startTimeMillis) / 1000;
        TimerPlugin.timerRunning = false;

        activity.runOnUiThread(() -> TimerForegroundService.stop(activity));
    }

    @JavascriptInterface
    public void resumeTimer() {
        if (!TimerPlugin.timerPaused) return;
        TimerPlugin.timerPaused = false;
        TimerPlugin.timerRunning = true;
        TimerPlugin.startTimeMillis = System.currentTimeMillis() - TimerPlugin.pauseElapsedSeconds * 1000;
        TimerPlugin.pauseElapsedSeconds = 0;

        activity.runOnUiThread(() -> {
            if ("down".equals(TimerPlugin.timerType)) {
                TimerForegroundService.startForDown(activity, TimerPlugin.totalSeconds);
            } else {
                TimerForegroundService.startForUp(activity);
            }
        });
    }

    @JavascriptInterface
    public void stopTimer() {
        TimerPlugin.timerCompleted = false;
        TimerPlugin.timerRunning = false;
        TimerPlugin.timerPaused = false;
        TimerPlugin.timerType = null;
        TimerPlugin.startTimeMillis = 0;
        TimerPlugin.totalSeconds = 0;
        TimerPlugin.pauseElapsedSeconds = 0;

        activity.runOnUiThread(() -> TimerForegroundService.stop(activity));
    }

    // ---- Export (background thread ops + UI thread intent) ----

    @JavascriptInterface
    public String exportData(String content, String filename) {
        try {
            if (filename == null || filename.isEmpty()) filename = "tomato-clock-backup.json";

            // Write to cache dir (always works)
            File cacheDir = activity.getCacheDir();
            File cacheFile = new File(cacheDir, filename);
            OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(cacheFile), StandardCharsets.UTF_8);
            writer.write(content);
            writer.close();

            // Write to Downloads via MediaStore (API 29+, no permissions)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri itemUri = activity.getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (itemUri != null) {
                        try (OutputStream os = activity.getContentResolver().openOutputStream(itemUri)) {
                            if (os != null) {
                                os.write(content.getBytes(StandardCharsets.UTF_8));
                            }
                        }
                        values.clear();
                        values.put(MediaStore.Downloads.IS_PENDING, 0);
                        activity.getContentResolver().update(itemUri, values, null, null);
                    }
                } catch (Exception ignored) {}
            } else {
                // API 23-28: best-effort to public Downloads
                try {
                    File publicDir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    if (publicDir != null) {
                        File pubFile = new File(publicDir, filename);
                        OutputStreamWriter pw = new OutputStreamWriter(
                                new FileOutputStream(pubFile), StandardCharsets.UTF_8);
                        pw.write(content);
                        pw.close();
                    }
                } catch (Exception ignored) {}
            }

            // Share via FileProvider (must run on UI thread)
            final File fCacheFile = cacheFile;
            activity.runOnUiThread(() -> {
                try {
                    Uri uri = FileProvider.getUriForFile(
                            activity,
                            activity.getPackageName() + ".fileprovider",
                            fCacheFile
                    );
                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType("*/*");
                    shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    Intent chooser = Intent.createChooser(shareIntent, "导出备份到…");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(chooser);
                } catch (Exception ignored) {}
            });

            return "{\"success\":true}";
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null) msg = "unknown error";
            return "{\"error\":\"" + escapeJson(msg) + "\"}";
        }
    }

    // ---- Helpers ----

    private static String jsonStr(String s) {
        if (s == null) return "null";
        return "\"" + escapeJson(s) + "\"";
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
