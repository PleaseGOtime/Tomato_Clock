package com.tomatoclock.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Register custom plugin
        registerPlugin(TimerPlugin.class);
    }
}
