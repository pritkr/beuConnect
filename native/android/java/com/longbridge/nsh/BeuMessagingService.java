package com.longbridge.nsh;

import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.util.Map;

/**
 * The one place an FCM message becomes a notification.
 *
 * The worker sends data-only messages, which is what makes the tap open a BEU
 * route instead of whatever activity FCM would guess. A message is:
 *
 *   id     stable event id, used for dedupe and as the notification's tag
 *   title  the notification's title
 *   body   one line, may be empty
 *   route  an app route name, e.g. "notices"
 *   params a JSON object string, e.g. {"id":"n1a2b3"}
 *   url    the site path, for a client that cannot route
 *
 * Data-only also means this method runs while the app is in the background —
 * FCM delivers it to the service first and only falls back to the tray for a
 * `notification` payload, which we never send.
 */
public final class BeuMessagingService extends FirebaseMessagingService {
    private static final String TAG = NotificationSetup.TAG;

    @Override
    public void onMessageReceived(RemoteMessage message) {
        try {
            Map<String, String> data = message.getData();
            String id = value(data, "id");
            String title = value(data, "title");
            String body = value(data, "body");
            String route = value(data, "route");
            String params = value(data, "params");
            String url = value(data, "url");

            // A message sent from the Firebase console carries `notification`
            // instead of `data`; turn it into the same shape so a console test
            // still proves the whole path.
            RemoteMessage.Notification visible = message.getNotification();
            if (title.isEmpty() && visible != null) title = text(visible.getTitle());
            if (body.isEmpty() && visible != null) body = text(visible.getBody());
            if (id.isEmpty()) id = "push:" + message.getMessageId();

            boolean posted = NotificationSetup.post(
                    getApplicationContext(), id, title, body, route, params, url);
            Log.i(TAG, (posted ? "posted " : "skipped ") + id);
        } catch (Throwable error) {
            // A service that throws is killed; the next message would still be
            // delivered, but a stack trace in logcat is the only useful signal.
            Log.e(TAG, "message failed", error);
        }
    }

    @Override
    public void onNewToken(String token) {
        // Deliberately not sent anywhere: the app subscribes to topics, so the
        // server never stores a token and never learns which device is which.
        // Logged at debug level only, and truncated, so a support log does not
        // become a credential.
        Log.d(TAG, "token refreshed: " + (token.length() > 12 ? token.substring(0, 12) + "…" : token));
        NotificationSetup.sync(getApplicationContext());
    }

    private static String value(Map<String, String> data, String key) {
        String raw = data.get(key);
        return raw == null ? "" : raw;
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    /** Kept for symmetry with the sender: a params string must at least parse. */
    static String validParams(String params) {
        if (params == null || params.isEmpty()) return "{}";
        try {
            new JSONObject(params);
            return params;
        } catch (Throwable invalid) {
            return "{}";
        }
    }
}
