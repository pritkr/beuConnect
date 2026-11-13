package com.longbridge.nsh;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.view.View;

import java.lang.ref.WeakReference;
import java.util.Map;

/**
 * The `Notify` component: the Notifications screen's handle on the host.
 *
 * Commands: status, enable, disable, topics {important, results, notices},
 *           test, sync.
 * Events:   state {supported, enabled, permission, topics, lastAt}.
 *
 * The screen cannot request POST_NOTIFICATIONS itself (only an Activity can),
 * so `enable` goes through here: ask once, then let
 * `MainActivity.onRequestPermissionsResult` publish the answer. A refusal is a
 * state, not an error — the switch stays on and the row says why nothing
 * arrives.
 */
final class NotifyComponent implements NshComponent {
    private static final int REQUEST_PERMISSION = 2;
    private static WeakReference<NotifyComponent> current = new WeakReference<>(null);

    private final NshComponentContext bridge;
    private final Context context;
    private final Activity activity;
    private final View view;

    NotifyComponent(NshComponentContext bridge, Activity activity) {
        this.bridge = bridge;
        this.activity = activity;
        this.context = activity.getApplicationContext();
        this.view = new View(activity);
        this.view.setVisibility(View.GONE);
        current = new WeakReference<>(this);
        // The channel must exist before the first message; creating it here also
        // means Android's own settings screen has the right name to show.
        NotificationSetup.ensureChannel(this.context);
        NotificationSetup.sync(this.context);
    }

    @Override
    public View view() {
        return view;
    }

    @Override
    public void setProp(String name, Object value) {
        // No props: every value is read from the host, which owns the switch.
    }

    @Override
    public void command(String name, Object value) {
        switch (name) {
            case "status":
                NotificationSetup.sync(context);
                emit();
                break;
            case "enable":
                enable();
                break;
            case "disable":
                NotificationSetup.setEnabled(context, false);
                emit();
                break;
            case "topics":
                topics(value);
                break;
            case "test":
                NotificationSetup.postTest(context);
                emit();
                break;
            case "sync":
                NotificationSetup.sync(context);
                emit();
                break;
            default:
                break;
        }
    }

    private void enable() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && !NotificationSetup.permitted(context)) {
            NotificationSetup.markAsked(context);
            activity.requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_PERMISSION);
            // The answer arrives in onRequestPermissionsResult, which emits.
            return;
        }
        NotificationSetup.setEnabled(context, true);
        emit();
    }

    private void topics(Object value) {
        if (!(value instanceof Map)) return;
        Map<?, ?> changes = (Map<?, ?>) value;
        for (String topic : NotificationSetup.TOPICS) {
            Object flag = changes.get(topic);
            if (flag instanceof Boolean) NotificationSetup.setTopic(context, topic, (Boolean) flag);
        }
        emit();
    }

    private void emit() {
        try {
            bridge.emit("state", NotificationSetup.status(context));
        } catch (Throwable ignored) {
            // The screen may already be gone.
        }
    }

    /** Re-publishes state after a system dialog the component did not open. */
    static void refresh(Context context) {
        NotifyComponent live = current.get();
        if (live != null) {
            NotificationSetup.sync(context);
            live.emit();
        }
    }

    static int permissionRequestCode() {
        return REQUEST_PERMISSION;
    }

    @Override
    public void destroy() {
        if (current.get() == this) current = new WeakReference<>(null);
    }
}
