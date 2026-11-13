package com.longbridge.nsh;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Puts the campus Wi-Fi job back after the two events that quietly drop it.
 *
 * A persisted job usually comes back on its own, but not everywhere: an OEM
 * that clears jobs at boot, a phone that boots with the app force-stopped, and
 * the package replace itself all leave the feature dead until someone opens
 * the app. That is the one failure a student cannot diagnose — the Wi-Fi screen
 * would still say "on" while nothing was running.
 *
 * Cheap on purpose: a preferences read and two binder calls, no network.
 */
public final class WifiBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }

        try {
            if (!WifiAutoLogin.load(context).enabled) return;
            WifiAutoLoginJob.schedule(context);
            WifiAutoLoginJob.checkSoon(context);
            Log.i(WifiAutoLogin.TAG, "re-armed after " + action);
        } catch (Throwable error) {
            // A receiver that throws is killed before it can be useful.
            Log.i(WifiAutoLogin.TAG, "could not re-arm: " + error);
        }
    }
}
