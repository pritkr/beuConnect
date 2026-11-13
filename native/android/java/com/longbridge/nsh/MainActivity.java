package com.longbridge.nsh;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * BEUConnect's Android host.
 *
 * It is the stock standalone host (edge-to-edge window, one NshView, the
 * bundle in assets/nsh) plus the components the app needs and the stock host
 * does not have: `PdfPage` (Android's own PdfRenderer), `AskAi`, `WifiAuto` and
 * `Notify`.
 *
 * It is also where a notification tap becomes an app route. The launch payload
 * goes through `NshView.setParams` before the bundle loads (cold start) and
 * through `send("beu.open", …)` afterwards (warm start); `src/app/shell.tsx`
 * reads one and listens for the other. Keeping it here is what lets the tap
 * work with no JavaScript running yet.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "BEUConnect";
    private NshView view;
    /** The native fallback shown when the bundle itself will not load. */
    private View failurePanel;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        DevActivity.edgeToEdge(this);
        view = new NshView(this);
        // A bundle that fails to load (a truncated download, a corrupt update)
        // used to leave a blank window with nothing to press. `reportError` is
        // the only failure signal the host gets, so it paints a way out.
        view.setErrorListener(this::showStartFailure);
        view.useStandaloneLimits();
        view.registerComponent("PdfPage", context -> new PdfPageComponent(context, this));
        view.registerComponent("AskAi", context -> new AskAiComponent(context, this));
        // Campus Wi-Fi sign-in: a command target for the screen, and the
        // owner of the in-app check loop. The 15-minute JobService keeps
        // working after this activity is gone.
        view.registerComponent("WifiAuto", context -> new WifiAutoLoginComponent(context, this));
        // Push notifications: the channel, the topic subscriptions and the
        // permission prompt. The message itself arrives in BeuMessagingService.
        view.registerComponent("Notify", context -> new NotifyComponent(context, this));

        // Cold start from a notification: the params must exist before the
        // bundle's first frame, or the app opens on Home and the notice is lost.
        Map<String, Object> launch = openPayload(getIntent());
        if (launch != null) view.setParams(launch);

        setContentView(view);
        view.loadAssetBundle("nsh");
        // Handled: drop the extra so a rotation or a process restart does not
        // reopen the same notice over whatever the student is doing.
        if (launch != null) getIntent().removeExtra("beu.route");

        // Android 9 has no MediaStore Downloads collection; saving a PDF there
        // writes the public Downloads folder, which needs this one grant.
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1);
        }
    }

    /**
     * A notification tapped while the app is alive lands here.
     *
     * `setIntent` matters: `onCreate` reads `getIntent()` and a stale intent is
     * how a warm tap ends up reopening the previous notice.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Map<String, Object> payload = openPayload(intent);
        if (payload == null || view == null) return;
        view.send("beu.open", payload.get("open"));
        intent.removeExtra("beu.route");
    }

    /**
     * The launch/notification payload as `host.params`.
     *
     * `{"open": {"route": "notices", "params": {"id": "n1a2b3"}, "url": "/notices/#notice-…"}}`
     *
     * A missing route is not a launch request: it is an ordinary app start.
     */
    private static Map<String, Object> openPayload(Intent intent) {
        if (intent == null) return null;
        String route = intent.getStringExtra("beu.route");
        if (route == null || route.isEmpty()) return null;

        Map<String, Object> open = new HashMap<>();
        open.put("route", route);
        open.put("params", params(intent.getStringExtra("beu.params")));
        String url = intent.getStringExtra("beu.url");
        open.put("url", url == null ? "" : url);

        Map<String, Object> root = new HashMap<>();
        root.put("open", open);
        return root;
    }

    /** A params string is untrusted: keep scalars, drop anything else. */
    private static Map<String, Object> params(String raw) {
        Map<String, Object> params = new HashMap<>();
        if (raw == null || raw.isEmpty()) return params;
        try {
            JSONObject object = new JSONObject(raw);
            Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = object.opt(key);
                if (value instanceof String || value instanceof Number || value instanceof Boolean) {
                    params.put(key, value);
                }
            }
        } catch (Throwable malformed) {
            // A notification with a broken params string still opens the board.
        }
        return params;
    }

    /**
     * The bundle will not load: `NshView` logs it and stops, which is a blank
     * window. Paint a native page with one action — load it again — instead.
     *
     * `reportError` is posted to the main thread by `NshView`, so this runs on
     * the UI thread. It is not the JS uncaught-exception hook (nsh has none);
     * it covers a bundle that is truncated or corrupt after an update.
     */
    private void showStartFailure(String message) {
        Log.e(TAG, "bundle failed to load: " + message);
        if (failurePanel != null || isFinishing()) return;

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.WHITE);
        panel.setPadding(64, 64, 64, 64);

        TextView title = new TextView(this);
        title.setText("BEUConnect could not start");
        title.setTextSize(20);
        title.setTextColor(0xFF1C1917);
        title.setGravity(Gravity.CENTER);

        TextView detail = new TextView(this);
        detail.setText("Nothing on this phone was changed. Reopen the app; if it keeps happening, install the latest version.");
        detail.setTextSize(15);
        detail.setTextColor(0xFF6B6259);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, 16, 0, 32);

        Button reopen = new Button(this);
        reopen.setText("Reopen");
        reopen.setOnClickListener(button -> {
            removeFailurePanel();
            view.loadAssetBundle("nsh");
        });

        panel.addView(title, fullWidth());
        panel.addView(detail, fullWidth());
        panel.addView(reopen, fullWidth());
        failurePanel = panel;
        addContentView(panel, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private static LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private void removeFailurePanel() {
        if (failurePanel == null) return;
        ViewGroup parent = (ViewGroup) failurePanel.getParent();
        if (parent != null) parent.removeView(failurePanel);
        failurePanel = null;
    }

    /**
     * The notification permission answer. Re-syncs the topics and tells the
     * screen, so the switch reflects the system dialog instead of the tap that
     * opened it.
     */
    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] granted) {
        super.onRequestPermissionsResult(request, permissions, granted);
        if (request != NotifyComponent.permissionRequestCode()) return;
        NotificationSetup.markAsked(this);
        NotifyComponent.refresh(this);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        DevActivity.systemBars(this);
    }

    @Override
    public void onBackPressed() {
        if (view == null || !view.handleBack()) super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (view != null) view.destroy();
        super.onDestroy();
    }
}
