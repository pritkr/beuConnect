package com.longbridge.nsh;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

/**
 * The background half of campus sign-in: one persisted periodic job.
 *
 * It is deliberately a JobService and not a foreground service. A permanent
 * notification is a real cost for a session keeper, and Android already knows
 * how to run a job when there is a network, defer it in Doze, and restore it
 * after a reboot. The floor is 15 minutes; the in-app loop is the fast path
 * while the process is alive, and this is the safety net after it is not.
 *
 * The work itself is `WifiAutoLogin.run`, which is Java all the way down: at
 * this point the app's bundle is not loaded and there is no JavaScript VM.
 */
public final class WifiAutoLoginJob extends JobService {
    private static final int JOB_ID = 4701;
    /** "Check once there is a network": used after a reboot or an app update. */
    private static final int ONCE_ID = 4702;
    /** The shortest period JobScheduler accepts. */
    private static final long PERIOD_MS = 15L * 60L * 1000L;
    /** JobScheduler gives a job ten minutes; this is the lock's own ceiling. */
    private static final long WAKELOCK_MS = 10L * 60L * 1000L;

    private static volatile Thread worker;

    static void schedule(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null) return;

        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, WifiAutoLoginJob.class))
                .setPeriodic(PERIOD_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                // Survives a reboot only with RECEIVE_BOOT_COMPLETED declared.
                .setPersisted(true)
                .build();
        try {
            scheduler.schedule(job);
        } catch (RuntimeException ignored) {
            // A device that refuses the job still gets the in-app loop.
        }
    }

    /**
     * A reboot or an app update is exactly when a persisted job goes missing,
     * so the receiver asks for one check now instead of waiting 15 minutes.
     */
    static void checkSoon(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null) return;

        JobInfo job = new JobInfo.Builder(ONCE_ID, new ComponentName(context, WifiAutoLoginJob.class))
                .setMinimumLatency(5_000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        try {
            scheduler.schedule(job);
        } catch (RuntimeException ignored) {
        }
    }

    static void cancel(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null) return;
        scheduler.cancel(JOB_ID);
        scheduler.cancel(ONCE_ID);
    }

    @Override
    public boolean onStartJob(JobParameters parameters) {
        Log.i(WifiAutoLogin.TAG, "job fired");
        final PowerManager.WakeLock lock = wakeLock(getApplicationContext());
        try {
            Thread thread = new Thread(() -> {
                try {
                    WifiAutoLogin.run(getApplicationContext(), null, false);
                } catch (Throwable error) {
                    Log.i(WifiAutoLogin.TAG, "check crashed: " + error);
                } finally {
                    release(lock);
                    try {
                        jobFinished(parameters, false);
                    } catch (Throwable ignored) {
                        // The system already dropped the slot.
                    }
                }
            }, "beu-wifi-job");
            thread.setDaemon(true);
            worker = thread;
            thread.start();
        } catch (Throwable error) {
            // Out of threads or memory: the next window comes round anyway.
            release(lock);
            return false;
        }
        // The check is still running: tell the scheduler not to reap us yet.
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters parameters) {
        // The system wants the slot back (Doze, or the app went away). Cut the
        // check short; a periodic job returns on its own, so no retry.
        Thread running = worker;
        if (running != null) {
            try {
                running.interrupt();
            } catch (Throwable ignored) {
            }
        }
        return false;
    }

    /**
     * A job that hands its work to a thread holds no wake lock of its own: the
     * scheduler's lock ends when `onStartJob` returns. Without this a phone
     * that sleeps mid-authentication abandons the request half-done, and the
     * student is left on a captive network with no error to show for it.
     */
    private static PowerManager.WakeLock wakeLock(Context context) {
        try {
            PowerManager manager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (manager == null) return null;
            PowerManager.WakeLock lock =
                    manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "beu:wifi-auto");
            lock.setReferenceCounted(false);
            lock.acquire(WAKELOCK_MS);
            return lock;
        } catch (Throwable error) {
            return null;
        }
    }

    private static void release(PowerManager.WakeLock lock) {
        if (lock == null) return;
        try {
            lock.release();
        } catch (Throwable ignored) {
        }
    }

    private static JobScheduler scheduler(Context context) {
        try {
            return (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        } catch (Throwable error) {
            return null;
        }
    }
}
