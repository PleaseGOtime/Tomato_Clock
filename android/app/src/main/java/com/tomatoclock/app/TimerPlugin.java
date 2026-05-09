package com.tomatoclock.app;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

    // Timer state (volatile for cross-thread visibility with foreground service)
    public static volatile boolean timerRunning = false;
    public static volatile boolean timerPaused = false;
    public static volatile String timerType = null;   // "up" or "down"
    public static volatile long startTimeMillis = 0;
    public static volatile long totalSeconds = 0;
    public static volatile long pauseElapsedSeconds = 0;
    public static volatile boolean timerCompleted = false;

    @PluginMethod
    public void startUpTimer(PluginCall call) {
        timerCompleted = false;
        timerType = "up";
        timerRunning = true;
        timerPaused = false;
        startTimeMillis = System.currentTimeMillis();
        totalSeconds = 0;
        pauseElapsedSeconds = 0;

        TimerForegroundService.startForUp(getContext());
        call.resolve();
    }

    @PluginMethod
    public void startDownTimer(PluginCall call) {
        timerCompleted = false;
        long seconds = call.getLong("totalSeconds", 1500L);
        timerType = "down";
        timerRunning = true;
        timerPaused = false;
        startTimeMillis = System.currentTimeMillis();
        totalSeconds = seconds;
        pauseElapsedSeconds = 0;

        TimerForegroundService.startForDown(getContext(), totalSeconds);
        call.resolve();
    }

    @PluginMethod
    public void pauseTimer(PluginCall call) {
        if (!timerRunning || timerPaused) {
            call.resolve();
            return;
        }
        timerPaused = true;
        pauseElapsedSeconds = (System.currentTimeMillis() - startTimeMillis) / 1000;
        timerRunning = false;
        TimerForegroundService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void resumeTimer(PluginCall call) {
        if (!timerPaused) {
            call.resolve();
            return;
        }
        timerPaused = false;
        timerRunning = true;
        // Shift start time so elapsed continues from pause point
        startTimeMillis = System.currentTimeMillis() - pauseElapsedSeconds * 1000;
        pauseElapsedSeconds = 0;

        if ("down".equals(timerType)) {
            TimerForegroundService.startForDown(getContext(), totalSeconds);
        } else {
            TimerForegroundService.startForUp(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void stopTimer(PluginCall call) {
        timerCompleted = false;
        timerRunning = false;
        timerPaused = false;
        timerType = null;
        startTimeMillis = 0;
        totalSeconds = 0;
        pauseElapsedSeconds = 0;

        TimerForegroundService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getTimerState(PluginCall call) {
        JSObject ret = new JSObject();

        if (timerCompleted) {
            ret.put("type", "none");
            ret.put("running", false);
            ret.put("paused", false);
            ret.put("completed", true);
            timerCompleted = false;
        } else if (timerPaused) {
            ret.put("type", timerType);
            ret.put("running", false);
            ret.put("paused", true);
            ret.put("elapsed", pauseElapsedSeconds);
            ret.put("remaining", Math.max(0, totalSeconds - pauseElapsedSeconds));
            ret.put("total", totalSeconds);
        } else if (timerRunning && timerType != null) {
            long elapsed = (System.currentTimeMillis() - startTimeMillis) / 1000;
            ret.put("type", timerType);
            ret.put("running", true);
            ret.put("paused", false);
            ret.put("elapsed", elapsed);
            if ("down".equals(timerType)) {
                long remaining = Math.max(0, totalSeconds - elapsed);
                ret.put("remaining", remaining);
                ret.put("total", totalSeconds);
                if (remaining <= 0) {
                    ret.put("completed", true);
                }
            }
        } else {
            ret.put("type", "none");
            ret.put("running", false);
            ret.put("paused", false);
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void exportData(PluginCall call) {
        String content = call.getString("content", "{}");
        String filename = call.getString("filename", "tomato-clock-backup.json");

        try {
            // Step 1: Write to cache dir (always works)
            File cacheDir = getContext().getCacheDir();
            File cacheFile = new File(cacheDir, filename);
            OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(cacheFile), StandardCharsets.UTF_8);
            writer.write(content);
            writer.close();

            // Step 2: Also write to Downloads via MediaStore (API 29+, no permissions)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri itemUri = getContext().getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (itemUri != null) {
                        OutputStream os = getContext().getContentResolver().openOutputStream(itemUri);
                        if (os != null) {
                            os.write(content.getBytes(StandardCharsets.UTF_8));
                            os.close();
                        }
                        values.clear();
                        values.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContext().getContentResolver().update(itemUri, values, null, null);
                    }
                } catch (Exception ignored) {
                    // MediaStore write is optional
                }
            } else {
                // API 23-28: try to save to public Downloads (needs WRITE_EXTERNAL_STORAGE,
                // but we don't have it — so this is best-effort)
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

            // Step 3: Share via FileProvider (user picks destination)
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    cacheFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("*/*");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Intent chooser = Intent.createChooser(shareIntent, "导出备份到…");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("导出失败: " + e.getMessage());
        }
    }
}
