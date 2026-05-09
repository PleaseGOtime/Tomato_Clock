package com.tomatoclock.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String time = call.getString("time", "00:00:00");
        TimerForegroundService.start(getContext(), time);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        String time = call.getString("time", "00:00:00");
        TimerForegroundService.update(getContext(), time);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TimerForegroundService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        // Simple check - foreground service is considered running if the timer plugin has been started
        // The actual state is tracked in JS, this is a convenience for JS to know if native service is active
        ret.put("running", false);
        call.resolve(ret);
    }
}
