import {
	PORTAL_DEFAULT_HOST,
	PORTAL_DEFAULT_PASSWORD,
	PORTAL_DEFAULT_USERNAME,
} from "./omada";

export type BookmarkletOptions = {
	host?: string;
	username?: string;
	password?: string;
	/** Rotate the trailing 3 digits (001-112) before falling back to the exact number. */
	rotate?: boolean;
};

/**
 * The zero-install path.
 *
 * A bookmarklet is the only thing that can talk to `http://192.168.1.3` from a
 * page that is *not* that host: it runs inside the portal's own origin, where
 * the request is same-origin and no mixed-content rule applies. It carries the
 * credentials inline because a captive network has no way to fetch them.
 */
const SOURCE = String.raw`(function () {
  var H = __HOST__;
  var U = __USER__;
  var P = __PASS__;
  var ROT = __ROT__;
  var here = location.hostname;
  var onPortal = /\/portal\//i.test(location.pathname) || here === H;
  if (!onPortal) { location.assign("http://" + H + "/"); return; }
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(here)) { return; }

  function say(text, ok) {
    var node = document.getElementById("beu-wifi-banner");
    if (!node) {
      node = document.createElement("div");
      node.id = "beu-wifi-banner";
      node.style.cssText = "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);padding:12px 18px;border-radius:12px;font:600 14px/1.45 system-ui,sans-serif;color:#fff;box-shadow:0 10px 34px rgba(0,0,0,.45);max-width:92vw;text-align:center";
      (document.body || document.documentElement).appendChild(node);
    }
    node.textContent = text;
    node.style.background = ok ? "#15803d" : "#b91c1c";
  }

  function context() {
    var body = {}, params = new URLSearchParams(location.search);
    var map = { cid: "clientMac", ap: "apMac", gateway: "gatewayMac", ssid: "ssidName", u: "originUrl" };
    for (var key in map) {
      var value = (params.get(key) || "").trim();
      if (value) body[map[key]] = key === "u" && !/^https?:\/\//i.test(value) ? "http://" + value : value;
    }
    var rid = parseInt(params.get("rid"), 10);
    if (!isNaN(rid)) body.radioId = rid;
    var vid = parseInt(params.get("vid"), 10);
    if (!isNaN(vid)) body.vid = vid;
    return body;
  }

  function post(url, body) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    return fetch(url, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body)
    }).then(function (response) {
      clearTimeout(timer);
      return response.text().then(function (text) {
        try { return JSON.parse(text); } catch (error) { return { errorCode: -1, msg: "HTTP " + response.status }; }
      });
    });
  }

  function method(result) {
    var setting = typeof result === "string" ? JSON.parse(result) : (result || {});
    var type = Number(setting.authType);
    var enabled = (setting.hotspot && setting.hotspot.enabledTypes) || [];
    if (type === 2 || type === 8) return { kind: "radius", type: type, path: "/portal/radius/auth" };
    if (type === 5) return { kind: "local", type: 5, path: "/portal/auth" };
    if (type === 1) return { kind: "simple", type: 1, path: "/portal/auth" };
    if (type === 0) return { kind: "none", type: 0, path: "/portal/auth" };
    if (type === 11) {
      if (enabled.indexOf(5) >= 0) return { kind: "local", type: 5, path: "/portal/auth" };
      if (enabled.indexOf(8) >= 0) return { kind: "radius", type: 8, path: "/portal/radius/auth" };
    }
    return null;
  }

  function bodyFor(kind, type, user) {
    var body = context();
    body.authType = type;
    if (kind === "radius") { body.username = user; body.password = P; }
    else if (kind === "local") { body.localuser = user; body.localuserPsw = P; }
    else if (kind === "simple") { body.simplePassword = P; }
    return body;
  }

  function users() {
    var list = [];
    if (ROT && /^\d+$/.test(U) && U.length > 3) {
      var prefix = U.slice(0, -3);
      for (var i = 0; i < 3; i += 1) {
        var candidate = prefix + ("00" + (1 + Math.floor(Math.random() * 112))).slice(-3);
        if (list.indexOf(candidate) < 0) list.push(candidate);
      }
    }
    list.push(U);
    return list;
  }

  function reached(url) {
    return fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(function (response) { return response.ok; })
      .catch(function () { return false; });
  }

  say("Signing you in…", true);

  post(location.origin + "/portal/getPortalPageSetting", context()).then(function (setting) {
    if (!setting) throw new Error("no-answer");
    if (setting.errorCode !== undefined && Number(setting.errorCode) !== 0) {
      throw new Error(setting.msg || "the portal rejected the request");
    }
    var chosen = method(setting.result);
    if (!chosen) throw new Error("this portal wants a voucher or SMS code");

    var list = users();
    var index = 0;
    function attempt() {
      if (index >= list.length) throw new Error("the login was rejected");
      var user = list[index++];
      return post(location.origin + chosen.path, bodyFor(chosen.kind, chosen.type, user)).then(function (response) {
        if (!response) throw new Error("no-answer");
        var code = response.errorCode === undefined ? null : Number(response.errorCode);
        if (code === 0 || (code === null && /^success/i.test(String(response.msg || "").trim()))) return user;
        if (code === -41527) return attempt();
        throw new Error(response.msg || "the login was rejected");
      });
    }
    return attempt();
  }).then(function () {
    say("Connected. You are back online.", true);
    var back = new URLSearchParams(location.search).get("u");
    if (back) {
      setTimeout(function () {
        location.replace(/^https?:\/\//i.test(back) ? back : "http://" + back);
      }, 900);
    }
  }).catch(function (error) {
    var reason = String((error && error.message) || error);
    if (reason === "no-answer") reason = "the portal did not answer";
    say("WiFi login failed: " + reason + ".", false);
  });
})();`;

/** The readable script, without the `javascript:` scheme. */
export function bookmarkletCode(options: BookmarkletOptions = {}): string {
	const values: Array<[string, string]> = [
		["__HOST__", JSON.stringify(options.host ?? PORTAL_DEFAULT_HOST)],
		["__USER__", JSON.stringify(options.username ?? PORTAL_DEFAULT_USERNAME)],
		["__PASS__", JSON.stringify(options.password ?? PORTAL_DEFAULT_PASSWORD)],
		["__ROT__", options.rotate === false ? "false" : "true"],
	];
	return values.reduce(
		(code, [token, value]) => code.replace(token, () => value),
		SOURCE.replace(/^\n/, ""),
	);
}

/**
 * The `href` for the draggable link. Percent-encoding keeps quotes, `#` and
 * `%` in a password from breaking the URL.
 */
export function bookmarkletHref(options: BookmarkletOptions = {}): string {
	return `javascript:${encodeURIComponent(bookmarkletCode(options))}`;
}
