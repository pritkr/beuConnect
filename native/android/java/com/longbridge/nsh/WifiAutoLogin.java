package com.longbridge.nsh;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * The campus portal client. Pure Java on purpose: it runs from a JobService
 * with the app closed, where the QuickJS bundle does not exist.
 *
 * What it does is what a browser does when the portal page opens:
 *
 * 1. ask a connectivity URL for `204`; a `302`/200 with a portal page means the
 *    network is captive and the redirect carries the entry URL;
 * 2. `POST /portal/getPortalPageSetting` with the client's MAC, AP and SSID to
 *    learn which authentication method the controller expects;
 * 3. `POST` the credentials to that method's endpoint;
 * 4. probe again, because "accepted" without internet is a quota problem, not
 *    a success.
 *
 * Credentials only ever go to the host the portal itself named. The one
 * relaxation is TLS verification on that host: Omada controllers ship a
 * self-signed certificate, exactly as the desktop tool trusts it.
 *
 * The numbers it tries mirror `src/features/tools/wifi-auto.ts`: the saved
 * registration number first, then two spread suffixes when rotation is on.
 */
final class WifiAutoLogin {
    /**
     * The logcat tag. `docs/ANDROID.md` tells a reader to grep for it, so the
     * runner logs exactly one line per *change* of state — a healthy session
     * re-checked every 90 s must not fill the buffer. The password is never
     * part of a line.
     */
    static final String TAG = "beu-wifi";
    /** The prefs file the runner owns; the screen reads it back through a snapshot. */
    static final String PREFS = "beu_wifi_auto";

    /*
     * Safety net only: the first launch pushes these from `wifi-auto.ts`, and
     * a job that somehow runs before that still has something to sign in with.
     */
    private static final String DEFAULT_REG_NO = "24105157049";
    private static final String DEFAULT_PASSWORD = "123456";
    private static final int ROTATION_MIN = 1;
    private static final int ROTATION_MAX = 112;

    private static final String CHECK_URL = "http://connectivitycheck.gstatic.com/generate_204";
    private static final String APPLE_URL = "http://captive.apple.com/hotspot-detect.html";
    private static final String USER_AGENT = "Mozilla/5.0 (Linux; Android) BEUConnect";
    private static final int CONNECT_TIMEOUT = 4000;
    private static final int READ_TIMEOUT = 6000;
    private static final int MAX_BODY = 256 * 1024;
    private static final long SETTLE_MS = 8000L;

    /** One check at a time: the in-app loop and the job can fire together. */
    private static final ReentrantLock LOCK = new ReentrantLock();

    private static final Pattern PORTAL_URL =
            Pattern.compile("https?://[^\\s\"'<>\\\\]+/portal/[^\\s\"'<>\\\\]*");
    private static final Pattern RELATIVE_PORTAL =
            Pattern.compile("[\"'](/portal/[^\"']+)[\"']");
    private static final Pattern META_URL =
            Pattern.compile("(?i)content\\s*=\\s*[\"'][^\"']*?url\\s*=\\s*([^\"'>\\s]+)");

    private WifiAutoLogin() {
    }

    interface Listener {
        void onState(Snapshot snapshot);
    }

    static final class Config {
        boolean enabled;
        String regNo = DEFAULT_REG_NO;
        String password = DEFAULT_PASSWORD;
        String portal = "";
        boolean rotate = true;
    }

    /** Everything the screen needs, in one object. */
    static final class Snapshot {
        boolean enabled;
        String regNo = "";
        String password = "";
        String portal = "";
        boolean rotate;
        String phase = "idle";
        String message = "";
        long at;
        long okAt;
        int attempts;

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("enabled", enabled);
            map.put("regNo", regNo);
            map.put("password", password);
            map.put("portal", portal);
            map.put("rotate", rotate);
            map.put("phase", phase);
            map.put("message", message);
            map.put("at", at);
            map.put("okAt", okAt);
            map.put("attempts", attempts);
            return map;
        }
    }

    private static final class Outcome {
        final String phase;
        final String message;

        private Outcome(String phase, String message) {
            this.phase = phase;
            this.message = message;
        }

        static Outcome online() {
            return new Outcome("online", "");
        }

        static Outcome signedIn(String message) {
            return new Outcome("signed-in", message);
        }

        static Outcome rejected(String message) {
            return new Outcome("rejected", message);
        }

        static Outcome unreachable(String message) {
            return new Outcome("unreachable", message);
        }
    }

    private static final class Probe {
        boolean online;
        String entryUrl;
        /** The network answered at all: the difference between "no Wi-Fi" and "no portal". */
        boolean answered;
    }

    /** The Omada entry URL's client context, which every portal request carries. */
    private static final class Entry {
        String url;
        String origin;
        String clientMac;
        String apMac;
        String gatewayMac;
        String ssid;
        String originUrl;
        int radioId = -1;
        int vid = -1;

        static Entry parse(String raw) {
            if (raw == null) return null;
            String cleaned = raw.trim()
                    .replace("\\/", "/")
                    .replace("&amp;", "&")
                    .replace("\\u0026", "&");
            URL url;
            try {
                url = new URL(cleaned);
            } catch (Exception error) {
                return null;
            }
            String protocol = url.getProtocol();
            if (!"http".equals(protocol) && !"https".equals(protocol)) return null;
            if (!url.getPath().contains("/portal/")) return null;

            Map<String, String> query = query(url.getQuery());
            Entry entry = new Entry();
            entry.url = cleaned;
            entry.origin = protocol + "://" + url.getAuthority();
            entry.clientMac = first(query, "cid", "clientMac", "client_mac");
            entry.apMac = first(query, "ap", "apMac", "ap_mac");
            entry.gatewayMac = first(query, "gateway", "gatewayMac", "gateway_mac");
            entry.ssid = first(query, "ssid", "ssidName", "ssid_name");
            entry.originUrl = first(query, "u", "originUrl", "origin_url");
            entry.radioId = numeric(first(query, "rid", "radioId", "radio_id"));
            entry.vid = numeric(first(query, "vid"));
            // Without the client MAC the controller cannot tie the request to
            // this phone; the reference tool rejects that case too.
            if (entry.clientMac.isEmpty()) return null;
            return entry;
        }

        Map<String, Object> contextFields() {
            Map<String, Object> fields = new LinkedHashMap<>();
            put(fields, "clientMac", clientMac);
            put(fields, "apMac", apMac);
            put(fields, "gatewayMac", gatewayMac);
            put(fields, "ssidName", ssid);
            put(fields, "originUrl", originUrl);
            if (radioId >= 0) fields.put("radioId", radioId);
            if (vid >= 0) fields.put("vid", vid);
            return fields;
        }

        /** A cached URL reused on a new day: the controller wants a fresh `t`. */
        Entry refreshed() {
            Entry copy = new Entry();
            copy.url = withQuery(url, "t", String.valueOf(System.currentTimeMillis() / 1000L));
            copy.origin = origin;
            copy.clientMac = clientMac;
            copy.apMac = apMac;
            copy.gatewayMac = gatewayMac;
            copy.ssid = ssid;
            copy.originUrl = originUrl;
            copy.radioId = radioId;
            copy.vid = vid;
            return copy;
        }
    }

    /** Which endpoint the controller wants, and what that endpoint calls the fields. */
    private static final class Method {
        final int authType;
        final String endpoint;
        final String kind;

        private Method(int authType, String endpoint, String kind) {
            this.authType = authType;
            this.endpoint = endpoint;
            this.kind = kind;
        }

        static Method forType(int authType, JSONObject result) {
            switch (authType) {
                case 2:
                case 8:
                    return new Method(authType, "/portal/radius/auth", "radius");
                case 5:
                    return new Method(5, "/portal/auth", "local");
                case 1:
                    return new Method(1, "/portal/auth", "simple");
                case 0:
                    return new Method(0, "/portal/auth", "none");
                case 11:
                    return hotspot(result);
                default:
                    // 3 (voucher) and 6 (SMS) are not username/password logins.
                    return null;
            }
        }

        private static Method hotspot(JSONObject result) {
            JSONObject hotspot = result == null ? null : result.optJSONObject("hotspot");
            JSONArray enabled = hotspot == null ? null : hotspot.optJSONArray("enabledTypes");
            if (enabled == null) return null;
            if (has(enabled, 5)) return new Method(5, "/portal/auth", "local");
            if (has(enabled, 8)) return new Method(8, "/portal/radius/auth", "radius");
            return null;
        }

        private static boolean has(JSONArray values, int wanted) {
            for (int index = 0; index < values.length(); index += 1) {
                if (values.optInt(index, -1) == wanted) return true;
            }
            return false;
        }

        void fill(Map<String, Object> payload, String user, String password) {
            switch (kind) {
                case "radius":
                    payload.put("username", user);
                    payload.put("password", password);
                    break;
                case "local":
                    payload.put("localuser", user);
                    payload.put("localuserPsw", password);
                    break;
                case "simple":
                    payload.put("simplePassword", password);
                    break;
                default:
                    break;
            }
        }
    }

    /* ------------------------------------------------------------------ run */

    /**
     * One check, end to end. `force` is the screen's "Check now": it runs even
     * when automatic sign-in is off, because the tap is the consent.
     */
    static Snapshot run(Context context, Listener listener, boolean force) {
        Config config = load(context);
        Snapshot snapshot = status(context);

        if (!config.enabled && !force) {
            snapshot.phase = "off";
            snapshot.message = "";
            publish(context, snapshot, listener);
            return snapshot;
        }
        if (!LOCK.tryLock()) return snapshot;

        try {
            String before = snapshot.phase;
            snapshot.phase = "checking";
            snapshot.message = "";
            snapshot.at = System.currentTimeMillis();
            publish(context, snapshot, listener);

            Outcome outcome;
            try {
                outcome = check(context, config);
            } catch (Throwable error) {
                outcome = Outcome.unreachable(describe(error));
            }

            snapshot.phase = outcome.phase;
            snapshot.message = outcome.message;
            snapshot.at = System.currentTimeMillis();
            if ("signed-in".equals(outcome.phase) || "online".equals(outcome.phase)) {
                if ("signed-in".equals(outcome.phase)) snapshot.okAt = snapshot.at;
                snapshot.attempts = 0;
            } else {
                snapshot.attempts += 1;
            }
            publish(context, snapshot, listener);
            if (!before.equals(outcome.phase)) {
                Log.i(TAG, outcome.phase + (outcome.message.isEmpty() ? "" : ": " + outcome.message));
            }
            return snapshot;
        } finally {
            LOCK.unlock();
        }
    }

    private static Outcome check(Context context, Config config) {
        Probe probe = probe();
        if (probe.online) return Outcome.online();

        String entryUrl = probe.entryUrl;
        if (entryUrl == null) entryUrl = fromSavedPortal(config);
        if (entryUrl == null) entryUrl = cachedEntry(context);
        if (entryUrl == null) {
            return Outcome.unreachable(probe.answered
                    ? "The network answered, but no sign-in page was found. Join the campus Wi-Fi and try again."
                    : "No network. It will try again when Wi-Fi connects.");
        }

        Entry entry = Entry.parse(entryUrl);
        if (entry == null) {
            return Outcome.unreachable("The sign-in address the portal sent could not be read.");
        }
        return login(context, config, entry);
    }

    private static Outcome login(Context context, Config config, Entry entry) {
        // The GET a browser makes before the portal's own POSTs: it hands out
        // the session cookie, and some controllers answer nothing without it.
        Jar jar = session(entry);

        Reply setting;
        try {
            setting = post(entry, entry.origin + "/portal/getPortalPageSetting", entry.contextFields(), jar);
        } catch (IOException error) {
            return Outcome.unreachable("The sign-in page did not answer. It will retry.");
        }

        if (setting.json == null) {
            if (setting.redirect()) {
                forgetEntry(context);
                return Outcome.unreachable("The portal moved. Retrying with a fresh address.");
            }
            return Outcome.unreachable("The sign-in page answered, but not with a portal reply.");
        }

        int settingCode = setting.json.optInt("errorCode", 0);
        if (settingCode != 0) {
            if (settingCode == -41526) {
                forgetEntry(context);
                return Outcome.unreachable("The portal wants a fresh address. Retrying.");
            }
            return Outcome.unreachable("The portal refused the session (" + settingCode + ").");
        }

        JSONObject result = setting.json.optJSONObject("result");
        int authType = result == null ? 0 : result.optInt("authType", 0);
        Method method = Method.forType(authType, result);
        if (method == null) {
            return Outcome.rejected("This portal asks for a voucher or an SMS code. The app cannot sign in to that.");
        }

        List<String> names = plan(config);
        if (names.isEmpty()) {
            return Outcome.rejected("Add the registration number before signing in.");
        }

        Outcome last = Outcome.rejected("The portal rejected the sign-in.");
        for (String name : names) {
            Map<String, Object> payload = entry.contextFields();
            payload.put("authType", method.authType);
            method.fill(payload, name, config.password);

            Reply answer;
            try {
                answer = post(entry, entry.origin + method.endpoint, payload, jar);
            } catch (IOException error) {
                return Outcome.unreachable("The sign-in request did not reach the portal. It will retry.");
            }

            // A redirect straight after the POST is how some controllers
            // acknowledge it: no JSON, just a 302 to the success page.
            if (answer.json == null && answer.redirect()) {
                rememberEntry(context, entry.url);
                if (waitOnline()) return Outcome.signedIn("Signed in as " + name + ".");
                return Outcome.rejected(
                        "The portal accepted the sign-in, but the internet is still blocked. The account may be out of data.");
            }

            JSONObject json = answer.json;
            int code = json != null && json.has("errorCode")
                    ? json.optInt("errorCode", Integer.MIN_VALUE)
                    : Integer.MIN_VALUE;
            String message = json == null ? "" : json.optString("msg", "");
            boolean accepted = code == 0
                    || (code == Integer.MIN_VALUE && "success".equalsIgnoreCase(message.trim()));
            if (accepted) {
                rememberEntry(context, entry.url);
                if (waitOnline()) return Outcome.signedIn("Signed in as " + name + ".");
                return Outcome.rejected(
                        "The portal accepted the sign-in, but the internet is still blocked. The account may be out of data.");
            }

            if (code == -41526) {
                forgetEntry(context);
                return Outcome.unreachable("The portal says the session is stale. Retrying with a fresh address.");
            }
            last = Outcome.rejected(describePortalError(code, message));
            // -41527 is "unknown local user": another suffix may exist.
            if (code == -41527 && config.rotate) continue;
            return last;
        }
        return last;
    }

    /**
     * Opens the entry page once, as a browser does, and keeps what it sets.
     * A failure here is not fatal: the POSTs may still be accepted.
     */
    private static Jar session(Entry entry) {
        Jar jar = new Jar();
        HttpURLConnection connection = null;
        try {
            connection = open(entry.url, true);
            connection.getResponseCode();
            read(connection);
            jar.absorb(connection);
        } catch (Throwable ignored) {
            // No cookie is better than no attempt.
        } finally {
            close(connection);
        }
        return jar;
    }

    /* -------------------------------------------------------------- probing */

    private static Probe probe() {
        Probe result = new Probe();
        String[] urls = {CHECK_URL, APPLE_URL};
        for (String raw : urls) {
            for (int attempt = 0; attempt < 2; attempt += 1) {
                if (probeOnce(raw, result)) return result;
                // An answer, even a bad one, is not worth repeating. A connect
                // that failed before the network came up is.
                if (result.answered) break;
                if (Thread.currentThread().isInterrupted()) return result;
                sleep(350L);
            }
        }
        return result;
    }

    /** One probe URL. True when the answer settled it (online, or a portal). */
    private static boolean probeOnce(String raw, Probe result) {
        HttpURLConnection connection = null;
        try {
            connection = open(raw, false);
            int status = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            String body = read(connection);
            result.answered = true;

            if (status == 204) {
                result.online = true;
                return true;
            }
            if (status >= 200 && status < 300 && isOnlineBody(raw, body)) {
                result.online = true;
                return true;
            }

            String found = null;
            if (location != null && location.contains("/portal/")) {
                found = absolute(raw, location);
            }
            if (found == null) found = findPortalUrl(body, raw);
            if (found != null) {
                result.entryUrl = found;
                return true;
            }
        } catch (Throwable ignored) {
            // The next check URL may still reach the portal.
        } finally {
            close(connection);
        }
        return false;
    }

    /**
     * A 200 is only "online" for a URL whose page says so. `generate_204`
     * answering 200 means the gateway substituted a login page.
     */
    private static boolean isOnlineBody(String url, String body) {
        if (!url.contains("captive.apple.com")) return false;
        String text = body.toLowerCase(Locale.US);
        return text.contains("<title>success</title>");
    }

    private static String findPortalUrl(String body, String base) {
        String text = body
                .replace("\\/", "/")
                .replace("&amp;", "&")
                .replace("\\u0026", "&");

        Matcher direct = PORTAL_URL.matcher(text);
        while (direct.find()) {
            String candidate = trimUrl(direct.group());
            if (!candidate.isEmpty()) return candidate;
        }

        Matcher meta = META_URL.matcher(text);
        while (meta.find()) {
            String candidate = absolute(base, meta.group(1));
            if (candidate != null) return candidate;
        }

        Matcher relative = RELATIVE_PORTAL.matcher(text);
        while (relative.find()) {
            String candidate = absolute(base, relative.group(1));
            if (candidate != null) return candidate;
        }
        return null;
    }

    /** The saved portal field: a whole entry URL, or a page that redirects to one. */
    private static String fromSavedPortal(Config config) {
        String saved = config.portal == null ? "" : config.portal.trim();
        if (saved.isEmpty()) return null;
        if (saved.contains("/portal/")) return saved;

        HttpURLConnection connection = null;
        try {
            connection = open(saved, false);
            int status = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            String body = read(connection);
            String found = null;
            if (location != null && location.contains("/portal/")) found = absolute(saved, location);
            if (found == null) found = findPortalUrl(body, saved);
            if (found != null) return found;
            if (status >= 200 && status < 300) {
                // The portal index itself: the controller answers entry links
                // relative to it, so try the conventional path once.
                return absolute(saved, "/portal/entry");
            }
        } catch (Throwable ignored) {
        } finally {
            close(connection);
        }
        return null;
    }

    private static String cachedEntry(Context context) {
        String cached = prefs(context).getString("last_entry", "");
        if (cached == null || cached.isEmpty()) return null;
        Entry entry = Entry.parse(cached);
        return entry == null ? null : entry.refreshed().url;
    }

    private static void rememberEntry(Context context, String url) {
        prefs(context).edit().putString("last_entry", url).apply();
    }

    private static void forgetEntry(Context context) {
        prefs(context).edit().remove("last_entry").apply();
    }

    private static boolean waitOnline() {
        long deadline = System.currentTimeMillis() + SETTLE_MS;
        while (System.currentTimeMillis() < deadline) {
            if (probe().online) return true;
            if (Thread.currentThread().isInterrupted()) return false;
            sleep(800L);
        }
        return probe().online;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            // The job was stopped: keep the flag so the caller's own loops
            // unwind instead of carrying on with a dead slot.
            Thread.currentThread().interrupt();
        }
    }

    /* ------------------------------------------------------------------ http */

    private static HttpURLConnection open(String raw, boolean portal) throws IOException {
        URL url = new URL(raw);
        String protocol = url.getProtocol();
        if (!"http".equals(protocol) && !"https".equals(protocol)) throw new IOException("not http(s)");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT);
        connection.setReadTimeout(READ_TIMEOUT);
        // A portal redirects with a body; following it blindly would forward
        // credentials to whatever host it named.
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        if (portal && connection instanceof HttpsURLConnection) {
            HttpsURLConnection https = (HttpsURLConnection) connection;
            SSLSocketFactory factory = trustAll();
            if (factory != null) https.setSSLSocketFactory(factory);
            https.setHostnameVerifier((hostname, session) -> true);
        }
        return connection;
    }

    /** One HTTP answer: the status matters as much as the JSON in it. */
    private static final class Reply {
        final int status;
        final JSONObject json;

        Reply(int status, JSONObject json) {
            this.status = status;
            this.json = json;
        }

        boolean redirect() {
            return status >= 300 && status < 400;
        }
    }

    /**
     * The cookies one check collects. `HttpURLConnection` has no jar of its
     * own, and an Omada controller hands out a session cookie on the entry
     * page that the later POSTs must present — a browser does this invisibly.
     */
    private static final class Jar {
        private final Map<String, String> cookies = new LinkedHashMap<>();

        void absorb(HttpURLConnection connection) {
            if (connection == null) return;
            for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() == null) continue;
                if (!"Set-Cookie".equalsIgnoreCase(header.getKey())) continue;
                for (String raw : header.getValue()) keep(raw);
            }
        }

        private void keep(String raw) {
            if (raw == null) return;
            String[] parts = raw.split(";");
            if (parts.length == 0) return;
            int equals = parts[0].indexOf('=');
            if (equals <= 0) return;
            String name = parts[0].substring(0, equals).trim();
            if (name.isEmpty()) return;
            String value = parts[0].substring(equals + 1).trim();
            for (int index = 1; index < parts.length; index += 1) {
                String flag = parts[index].trim().toLowerCase(Locale.US);
                // An expired cookie must not be sent again.
                if (flag.equals("max-age=0") || flag.startsWith("max-age=-")) {
                    cookies.remove(name);
                    return;
                }
            }
            cookies.put(name, value);
        }

        String header() {
            if (cookies.isEmpty()) return null;
            StringBuilder out = new StringBuilder();
            for (Map.Entry<String, String> cookie : cookies.entrySet()) {
                if (out.length() > 0) out.append("; ");
                out.append(cookie.getKey()).append('=').append(cookie.getValue());
            }
            return out.toString();
        }
    }

    private static Reply post(Entry entry, String url, Map<String, Object> payload, Jar jar) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = open(url, true);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            connection.setRequestProperty("Origin", entry.origin);
            connection.setRequestProperty("Referer", entry.url);
            String cookie = jar == null ? null : jar.header();
            if (cookie != null) connection.setRequestProperty("Cookie", cookie);

            byte[] body = new JSONObject(payload).toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body);
            }

            int status = connection.getResponseCode();
            if (jar != null) jar.absorb(connection);
            String text = read(connection);
            JSONObject json = null;
            if (!text.trim().isEmpty()) {
                try {
                    json = new JSONObject(text);
                } catch (JSONException ignored) {
                    // A redirect or an HTML error page: the status says more
                    // than a parse failure does, so keep going.
                }
            }
            return new Reply(status, json);
        } finally {
            close(connection);
        }
    }

    private static String read(HttpURLConnection connection) {
        InputStream stream = null;
        try {
            int status = connection.getResponseCode();
            stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) return "";
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int total = 0;
            int count;
            while ((count = stream.read(chunk)) != -1) {
                int keep = Math.min(count, MAX_BODY - total);
                if (keep <= 0) break;
                buffer.write(chunk, 0, keep);
                total += keep;
            }
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            return "";
        } finally {
            close(stream);
        }
    }

    private static void close(Object closeable) {
        // `HttpURLConnection` is not `AutoCloseable`: without this the socket
        // stays open until the collector runs, and a 90 s loop on a phone that
        // never sleeps exhausts its file descriptors within a day.
        if (closeable instanceof HttpURLConnection) {
            try {
                ((HttpURLConnection) closeable).disconnect();
            } catch (Throwable ignored) {
            }
            return;
        }
        if (closeable instanceof AutoCloseable) {
            try {
                ((AutoCloseable) closeable).close();
            } catch (Throwable ignored) {
            }
        }
    }

    /**
     * Omada controllers use a self-signed certificate. This factory is only
     * installed on requests to the host the portal itself named — the probes
     * and every other request keep the platform's verification.
     */
    private static volatile SSLSocketFactory trustAllFactory;

    private static SSLSocketFactory trustAll() {
        if (trustAllFactory != null) return trustAllFactory;
        try {
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[]{new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType) {
                }

                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType) {
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }}, new SecureRandom());
            trustAllFactory = context.getSocketFactory();
        } catch (Exception ignored) {
            // A portal with a valid certificate still works without it.
        }
        return trustAllFactory;
    }

    /* ------------------------------------------------------------------ plan */

    private static List<String> plan(Config config) {
        List<String> names = new ArrayList<>();
        String first = config.regNo == null ? "" : config.regNo.trim();
        if (first.isEmpty()) return names;
        names.add(first);
        if (!config.rotate || first.length() < 4) return names;

        int span = ROTATION_MAX - ROTATION_MIN + 1;
        int start = (int) Math.abs((System.currentTimeMillis() / 60_000L) % span);
        for (int index = 0; index < 2; index += 1) {
            int suffix = ROTATION_MIN + ((start + index * 37) % span);
            String name = rotate(first, suffix);
            if (!names.contains(name)) names.add(name);
        }
        return names;
    }

    private static String rotate(String regNo, int suffix) {
        int bounded = Math.min(ROTATION_MAX, Math.max(ROTATION_MIN, suffix));
        String tail = String.valueOf(1000 + bounded).substring(1);
        return regNo.substring(0, regNo.length() - 3) + tail;
    }

    private static String describePortalError(int code, String message) {
        switch (code) {
            case -41525:
                return "The portal says the password is wrong.";
            case -41527:
                return "The portal does not know that registration number.";
            default:
                break;
        }
        if (message != null && !message.trim().isEmpty()) return "The portal refused the sign-in: " + message.trim();
        return "The portal refused the sign-in (" + code + ").";
    }

    private static String describe(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        if (message == null || message.trim().isEmpty()) return "The check failed. It will retry.";
        return "The check failed: " + message.trim();
    }

    /* ------------------------------------------------------------- prefs/url */

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Config load(Context context) {
        SharedPreferences store = prefs(context);
        Config config = new Config();
        // No `enabled` key means the app has never configured this: the
        // product default is on, so a student who installs and opens the app
        // once is signed in without touching the screen. `save` always writes
        // the key, so an explicit "off" stays off.
        config.enabled = store.getBoolean("enabled", true);
        config.regNo = store.getString("reg_no", DEFAULT_REG_NO);
        config.password = store.getString("password", DEFAULT_PASSWORD);
        config.portal = store.getString("portal", "");
        config.rotate = store.getBoolean("rotate", true);
        return config;
    }

    static void save(Context context, Config config) {
        prefs(context).edit()
                .putBoolean("enabled", config.enabled)
                .putString("reg_no", config.regNo)
                .putString("password", config.password)
                .putString("portal", config.portal)
                .putBoolean("rotate", config.rotate)
                .apply();
    }

    static Snapshot status(Context context) {
        SharedPreferences store = prefs(context);
        Snapshot snapshot = new Snapshot();
        // Same default as `load`: an unconfigured install is on.
        snapshot.enabled = store.getBoolean("enabled", true);
        snapshot.regNo = store.getString("reg_no", DEFAULT_REG_NO);
        snapshot.password = store.getString("password", DEFAULT_PASSWORD);
        snapshot.portal = store.getString("portal", "");
        snapshot.rotate = store.getBoolean("rotate", true);
        snapshot.phase = store.getString("last_phase", "idle");
        snapshot.message = store.getString("last_message", "");
        snapshot.at = store.getLong("last_at", 0L);
        snapshot.okAt = store.getLong("ok_at", 0L);
        snapshot.attempts = store.getInt("attempts", 0);
        // The stored phase describes the last run; the switch describes now.
        if (!snapshot.enabled) snapshot.phase = "off";
        return snapshot;
    }

    private static void publish(Context context, Snapshot snapshot, Listener listener) {
        try {
            prefs(context).edit()
                    .putString("last_phase", snapshot.phase)
                    .putString("last_message", snapshot.message)
                    .putLong("last_at", snapshot.at)
                    .putLong("ok_at", snapshot.okAt)
                    .putInt("attempts", snapshot.attempts)
                    .apply();
        } catch (Throwable ignored) {
            // A full disk must not lose the event the screen is waiting for.
        }
        if (listener != null) {
            try {
                listener.onState(snapshot);
            } catch (Throwable ignored) {
                // The listener is the bridge; a dead JS side is not fatal.
            }
        }
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> values = new LinkedHashMap<>();
        if (raw == null || raw.isEmpty()) return values;
        for (String part : raw.split("&")) {
            if (part.isEmpty()) continue;
            int equals = part.indexOf('=');
            String key = equals >= 0 ? part.substring(0, equals) : part;
            String value = equals >= 0 ? part.substring(equals + 1) : "";
            try {
                values.put(URLDecoder.decode(key, "UTF-8"), URLDecoder.decode(value, "UTF-8"));
            } catch (Exception error) {
                values.put(key, value);
            }
        }
        return values;
    }

    private static String first(Map<String, String> values, String... keys) {
        for (String key : keys) {
            String value = values.get(key);
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private static int numeric(String value) {
        if (value == null || value.isEmpty()) return -1;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            return -1;
        }
    }

    private static void put(Map<String, Object> fields, String key, String value) {
        if (value != null && !value.isEmpty()) fields.put(key, value);
    }

    private static String absolute(String base, String reference) {
        if (reference == null) return null;
        try {
            return new URL(new URL(base), reference.trim().replace("&amp;", "&")).toString();
        } catch (Exception error) {
            return null;
        }
    }

    private static String trimUrl(String value) {
        String trimmed = value.trim();
        while (trimmed.endsWith(")") || trimmed.endsWith(";") || trimmed.endsWith(",") || trimmed.endsWith(".")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    /** Replaces (or appends) one query parameter without re-encoding the rest. */
    private static String withQuery(String raw, String key, String value) {
        int hash = raw.indexOf('#');
        String base = hash >= 0 ? raw.substring(0, hash) : raw;
        int mark = base.indexOf('?');
        String head = mark >= 0 ? base.substring(0, mark) : base;
        String query = mark >= 0 ? base.substring(mark + 1) : "";

        StringBuilder out = new StringBuilder();
        boolean replaced = false;
        for (String part : query.split("&")) {
            if (part.isEmpty()) continue;
            int equals = part.indexOf('=');
            String name = equals >= 0 ? part.substring(0, equals) : part;
            if (name.equals(key)) {
                part = key + "=" + value;
                replaced = true;
            }
            if (out.length() > 0) out.append('&');
            out.append(part);
        }
        if (!replaced) {
            if (out.length() > 0) out.append('&');
            out.append(key).append('=').append(value);
        }
        return head + "?" + out;
    }
}
