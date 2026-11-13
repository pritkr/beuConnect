package com.longbridge.nsh;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import java.util.Map;
import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * The `WifiAuto` component: the screen's handle on the background runner.
 *
 * Commands: status, save {regNo, password, portal, rotate, enabled}, check.
 * Events:   state {enabled, regNo, password, portal, rotate, phase, message, at, okAt, attempts}.
 *
 * It owns two things the job cannot: a fast in-process loop (90 s while the
 * session is healthy, 15–60 s while it is not) and a Wi-Fi network callback,
 * so joining the campus network is followed by a sign-in in seconds instead of
 * at the next 15-minute job window.
 *
 * The job is what makes the feature survive the process. `destroy()` stops the
 * loop but deliberately leaves the job scheduled: the app closing is exactly
 * the case this exists for.
 */
final class WifiAutoLoginComponent implements NshComponent {
    private static final long ONLINE_DELAY_MS = 90_000L;
    private static final long RETRY_BASE_MS = 15_000L;
    private static final long RETRY_MAX_MS = 60_000L;
    private static final long ARM_DELAY_MS = 4000L;
    private static final long NETWORK_DELAY_MS = 3000L;

    private static final Random JITTER = new Random();

    private final NshComponentContext bridge;
    private final Context context;
    private final View view;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "beu-wifi-auto");
        thread.setDaemon(true);
        return thread;
    });

    private ConnectivityManager.NetworkCallback network;
    private ScheduledFuture<?> next;
    private boolean armed;
    private volatile boolean destroyed;

    WifiAutoLoginComponent(NshComponentContext bridge, Context context) {
        this.bridge = bridge;
        this.context = context.getApplicationContext();
        this.view = new View(context);
        this.view.setVisibility(View.GONE);
        // A process restart with the feature already on: the job must exist
        // again even if nothing mounts the screen this time.
        if (WifiAutoLogin.load(this.context).enabled) arm();
    }

    @Override
    public View view() {
        return view;
    }

    @Override
    public void setProp(String name, Object value) {
        // No props: the config travels with `save`, so it is never stale.
    }

    @Override
    public void command(String name, Object value) {
        switch (name) {
            case "status":
                // Asking for the state is also a good moment to make sure the
                // safety net exists, in case it was dropped by an update.
                if (WifiAutoLogin.load(context).enabled) arm();
                emit(WifiAutoLogin.status(context));
                break;
            case "save":
                save(value);
                break;
            case "check":
                run(true);
                break;
            default:
                break;
        }
    }

    private void save(Object value) {
        if (!(value instanceof Map)) return;
        Map<?, ?> args = (Map<?, ?>) value;

        WifiAutoLogin.Config config = WifiAutoLogin.load(context);
        config.regNo = text(args.get("regNo"), config.regNo).trim();
        config.password = text(args.get("password"), config.password);
        config.portal = text(args.get("portal"), config.portal).trim();
        config.rotate = flag(args.get("rotate"), config.rotate);
        boolean wasEnabled = config.enabled;
        config.enabled = flag(args.get("enabled"), config.enabled);
        WifiAutoLogin.save(context, config);

        if (config.enabled) {
            arm();
        } else {
            disarm();
        }
        emit(WifiAutoLogin.status(context));

        // Turning it on is a request to sign in now, not in fifteen minutes.
        if (!wasEnabled && config.enabled) run(false);
    }

    private void arm() {
        // Scheduled once, not on every save: re-scheduling the same id restarts
        // its 15-minute window, and editing the form must not keep pushing the
        // safety net out.
        if (armed || destroyed) return;
        armed = true;
        WifiAutoLoginJob.schedule(context);
        watchNetwork();
        schedule(ARM_DELAY_MS);
    }

    private void disarm() {
        WifiAutoLoginJob.cancel(context);
        armed = false;
        unwatchNetwork();
        if (next != null) {
            next.cancel(false);
            next = null;
        }
    }

    private void run(boolean force) {
        if (destroyed) return;
        try {
            worker.execute(() -> {
                try {
                    WifiAutoLogin.Snapshot snapshot = WifiAutoLogin.run(context, this::emit, force);
                    scheduleNext(snapshot);
                } catch (Throwable error) {
                    // One bad check must never end the loop: reschedule as a
                    // failure and let the next window try again.
                    scheduleNext(null);
                }
            });
        } catch (RejectedExecutionException gone) {
            // destroy() won the race; the job is still scheduled.
        }
    }

    private void scheduleNext(WifiAutoLogin.Snapshot snapshot) {
        if (!armed || destroyed) return;
        boolean healthy = snapshot != null
                && ("signed-in".equals(snapshot.phase) || "online".equals(snapshot.phase));
        long delay = healthy
                ? jitter(ONLINE_DELAY_MS)
                : jitter(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.max(1, snapshot == null ? 1 : snapshot.attempts)));
        schedule(delay);
    }

    private void schedule(long delayMs) {
        if (destroyed) return;
        try {
            if (next != null) next.cancel(false);
            next = worker.schedule(() -> run(false), delayMs, TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException gone) {
            next = null;
        }
    }

    /**
     * ±10%, so a campus of phones that woke at the same moment does not reach
     * the portal in lockstep. Every one of them retrying at once is what makes
     * a recovering controller fall over again.
     */
    private static long jitter(long base) {
        long spread = Math.max(1L, base / 10L);
        return base + (long) (JITTER.nextDouble() * spread * 2.0d) - spread;
    }

    private void watchNetwork() {
        if (network != null) return;
        ConnectivityManager manager =
                (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return;

        network = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network available) {
                if (armed) schedule(NETWORK_DELAY_MS);
            }
        };
        try {
            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();
            manager.registerNetworkCallback(request, network);
        } catch (RuntimeException error) {
            network = null;
        }
    }

    private void unwatchNetwork() {
        if (network == null) return;
        ConnectivityManager manager =
                (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager != null) {
            try {
                manager.unregisterNetworkCallback(network);
            } catch (RuntimeException ignored) {
            }
        }
        network = null;
    }

    private void emit(WifiAutoLogin.Snapshot snapshot) {
        if (destroyed) return;
        Map<String, Object> state = snapshot.toMap();
        main.post(() -> {
            if (destroyed) return;
            try {
                bridge.emit("state", state);
            } catch (Throwable ignored) {
                // A dead JS side must not take the main thread down with it.
            }
        });
    }

    @Override
    public void destroy() {
        destroyed = true;
        armed = false;
        unwatchNetwork();
        if (next != null) next.cancel(false);
        worker.shutdownNow();
    }

    private static String text(Object value, String fallback) {
        return value instanceof String ? (String) value : fallback;
    }

    private static boolean flag(Object value, boolean fallback) {
        return value instanceof Boolean ? (Boolean) value : fallback;
    }
}
