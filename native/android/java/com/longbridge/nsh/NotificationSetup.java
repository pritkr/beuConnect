package com.longbridge.nsh;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.beuconnect.app.R;
import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Notifications, in the host because they have to arrive with the app closed.
 *
 * Firebase Cloud Messaging delivers a small data message; this class turns it
 * into a notification and keeps the three settings a student can change:
 * whether the app may notify, and one switch per topic.
 *
 * The topic list is the whole subscription model. The app subscribes to a
 * topic, the Cloudflare worker publishes to that topic, and no device token —
 * and therefore no student — ever reaches the server. That is also why
 * `onNewToken` only logs: there is nowhere to send a token, on purpose.
 *
 * Nothing here throws when Firebase is not configured (a checkout without
 * google-services.json, a desktop build, a device with no Play services).
 * `supported()` says so and the screen shows the reason.
 */
final class NotificationSetup {
    static final String TAG = "BEUNotify";
    static final String CHANNEL_ID = "beu.notices";
    static final String ACTION_OPEN = "org.beuconnect.app.OPEN_NOTICE";

    /** The topics the worker publishes to. One event belongs to exactly one. */
    static final String[] TOPICS = {"important", "results", "notices"};

    private static final String PREFS = "beu.notify";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_ASKED = "permission_asked";
    private static final String KEY_TOPIC = "topic.";
    private static final String KEY_LAST_AT = "last_at";
    private static final String KEY_SEEN = "seen";
    private static final int SEEN_LIMIT = 40;

    private NotificationSetup() {}

    /* ------------------------------------------------------------------ state */

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Whether this install can receive a push at all.
     *
     * `FirebaseApp.getApps` is empty when the build carried no
     * `google_app_id` — a valid state for a source checkout — and Play services
     * is what actually holds the socket, so a de-Googled phone is unsupported
     * rather than silently broken.
     */
    static boolean supported(Context context) {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return false;
        } catch (Throwable missing) {
            return false;
        }
        try {
            return GoogleApiAvailability.getInstance()
                    .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS;
        } catch (Throwable noPlay) {
            return false;
        }
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, true);
    }

    static boolean permitted(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager == null || manager.areNotificationsEnabled();
    }

    static boolean topicOn(Context context, String topic) {
        // Important and results are the reason someone installs this; a general
        // circular every day is the reason they turn it off again.
        boolean fallback = "important".equals(topic) || "results".equals(topic);
        return prefs(context).getBoolean(KEY_TOPIC + topic, fallback);
    }

    /** Marked before the prompt so a refusal is not asked again on every launch. */
    static boolean shouldAsk(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && !prefs(context).getBoolean(KEY_ASKED, false)
                && !permitted(context);
    }

    static void markAsked(Context context) {
        prefs(context).edit().putBoolean(KEY_ASKED, true).apply();
    }

    static void setEnabled(Context context, boolean on) {
        prefs(context).edit().putBoolean(KEY_ENABLED, on).apply();
        sync(context);
    }

    static void setTopic(Context context, String topic, boolean on) {
        prefs(context).edit().putBoolean(KEY_TOPIC + topic, on).apply();
        sync(context);
    }

    static Map<String, Object> status(Context context) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("supported", supported(context));
        state.put("enabled", enabled(context));
        state.put("permission", permitted(context));
        state.put("topics", topics(context));
        state.put("lastAt", prefs(context).getLong(KEY_LAST_AT, 0L));
        return state;
    }

    static Map<String, Object> topics(Context context) {
        Map<String, Object> topics = new LinkedHashMap<>();
        for (String topic : TOPICS) topics.put(topic, topicOn(context, topic));
        return topics;
    }

    /* ------------------------------------------------------------ subscription */

    /**
     * Makes the device's subscriptions match the switches.
     *
     * Called on every launch and after every change. `subscribeToTopic` is
     * idempotent (and cached locally), so the cost of calling it when nothing
     * changed is a preferences read, not a round trip.
     */
    static void sync(Context context) {
        if (!supported(context)) return;
        boolean want = enabled(context) && permitted(context);
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            for (String topic : TOPICS) {
                if (want && topicOn(context, topic)) {
                    messaging.subscribeToTopic(topic);
                } else {
                    messaging.unsubscribeFromTopic(topic);
                }
            }
        } catch (Throwable unavailable) {
            // Not initialized, or Play services went away mid-call. The next
            // launch retries; nothing on screen is waiting for this.
            Log.i(TAG, "subscriptions unchanged: " + unavailable);
        }
    }

    /* --------------------------------------------------------------- delivery */

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Notices & results", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("University circulars, examination forms and published results.");
        channel.enableVibration(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    /**
     * Posts one event. Returns false when it was already shown, so a duplicate
     * delivery (the same message retried by FCM) never buzzes twice.
     */
    static boolean post(Context context, String id, String title, String body,
                        String route, String params, String url) {
        if (id.isEmpty() || title.isEmpty()) return false;
        if (!enabled(context) || !permitted(context)) return false;

        SharedPreferences store = prefs(context);
        List<String> seen = seen(store);
        if (seen.contains(id)) return false;

        ensureChannel(context);
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        Intent open = new Intent(context, MainActivity.class);
        open.setAction(ACTION_OPEN);
        open.putExtra("beu.route", route.isEmpty() ? "notices" : route);
        open.putExtra("beu.params", params.isEmpty() ? "{}" : params);
        open.putExtra("beu.url", url);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent target = PendingIntent.getActivity(
                context, id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(context.getColor(R.color.brand))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(target)
                .setCategory(Notification.CATEGORY_RECOMMENDATION)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setWhen(System.currentTimeMillis());
        if (!body.isEmpty()) builder.setTicker(body);

        try {
            manager.notify(id.hashCode(), builder.build());
        } catch (Throwable rejected) {
            // A missing icon or a revoked permission throws at post time; a
            // notification is never a reason to take the app down.
            Log.e(TAG, "could not post " + id, rejected);
            return false;
        }

        seen.add(id);
        while (seen.size() > SEEN_LIMIT) seen.remove(0);
        store.edit()
                .putString(KEY_SEEN, new JSONArray(seen).toString())
                .putLong(KEY_LAST_AT, System.currentTimeMillis())
                .apply();
        return true;
    }

    /** A local notification: proves the channel, the icon and the tap work. */
    static void postTest(Context context) {
        post(context, "test:" + System.currentTimeMillis(),
                "Notifications are on",
                "This is how a BEU notice will look. Manage topics in Settings.",
                "notices", "{}", "");
    }

    private static List<String> seen(SharedPreferences store) {
        List<String> ids = new ArrayList<>();
        String raw = store.getString(KEY_SEEN, "");
        if (raw == null || raw.isEmpty()) return ids;
        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index += 1) {
                String value = array.optString(index, "");
                if (!value.isEmpty()) ids.add(value);
            }
        } catch (JSONException ignored) {
            // A corrupt list only costs one duplicate notification.
        }
        return ids;
    }
}
