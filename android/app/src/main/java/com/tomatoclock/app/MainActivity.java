package com.tomatoclock.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(TimerPlugin.class);

        // Register @JavascriptInterface bridge (reliable, bypasses Capacitor plugin system)
        try {
            WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.addJavascriptInterface(new AndroidBridge(this), "androidBridge");
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        try {
            WebView wv = getBridge().getWebView();
            if (wv != null) wv.resumeTimers();
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            WebView wv = getBridge().getWebView();
            if (wv != null) wv.resumeTimers();
        } catch (Exception ignored) {}
    }
}
