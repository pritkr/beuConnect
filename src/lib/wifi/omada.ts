/**
 * The Omada captive portal, as a browser has to talk to it.
 *
 * Written against the same flow the desktop daemon
 * (github.com/pritkr/omada-autologin) uses, so a login from this page, from
 * the bookmarklet and from the userscript all send the same thing:
 *
 *   1. POST /portal/getPortalPageSetting  -> an authType
 *   2. POST /portal/auth | /portal/radius/auth with the credentials
 *   3. errorCode 0 (or msg "success.") means the controller accepted it
 *
 * A page served over HTTPS cannot reach `http://192.168.1.3` — browsers block
 * mixed content and private-network requests. So this module only ever runs
 * same-origin (the portal page itself) or inside an extension, never
 * cross-origin from the deployed site. `isMixedContentBlocked` exists so the
 * UI can say exactly that instead of failing silently.
 */

/** The campus gateway. Overridable per-user; this is the shipped default. */
export const PORTAL_DEFAULT_HOST = "192.168.1.3";

/** The shared campus account. Both values are deliberately not secret. */
export const PORTAL_DEFAULT_USERNAME = "24105157049";
export const PORTAL_DEFAULT_PASSWORD = "123456";

/**
 * The controller issues usernames as a registration-number prefix plus a
 * rotating 3-digit suffix in 001-112. The prefix is what stays stable.
 */
export const PORTAL_ROTATION = { digits: 3, min: 1, max: 112 } as const;

export type PortalContext = {
	clientMac: string;
	apMac: string;
	gatewayMac: string;
	ssid: string;
	radioId: number | null;
	vid: number | null;
	originUrl: string;
};

export const EMPTY_CONTEXT: PortalContext = {
	clientMac: "",
	apMac: "",
	gatewayMac: "",
	ssid: "",
	radioId: null,
	vid: null,
	originUrl: "",
};

export type PortalEntry = {
	url: string;
	origin: string;
	host: string;
	context: PortalContext;
};

/** A controller sends `errorCode` as a number or a string, depending on build. */
const asNumber = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return null;
};

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Captive portals embed their entry URL in JavaScript, escaped as `https:\/\/`
 * and sometimes with `&amp;`. Undo both before parsing.
 */
export function normalisePortalUrl(raw: string): string {
	return raw
		.trim()
		.replace(/\\\//g, "/")
		.replace(/\\u0026/gi, "&")
		.replace(/&amp;/g, "&");
}

/** RFC1918 plus loopback and link-local: the only hosts we will ever POST to. */
export function isPrivateHost(host: string): boolean {
	const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
	if (!match) return false;
	const octets = match.slice(1).map(Number);
	if (octets.some((octet) => octet > 255)) return false;
	const [a, b] = octets;
	if (a === 10 || a === 127) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 169 && b === 254) return true;
	return false;
}

function contextFromSearch(search: string): PortalContext {
	const params = new URLSearchParams(search);
	const first = (...keys: string[]): string => {
		for (const key of keys) {
			const value = (params.get(key) ?? "").trim();
			if (value) return value;
		}
		return "";
	};
	const originUrl = first("u", "originUrl", "origin_url");
	return {
		clientMac: first("cid", "clientMac", "client_mac"),
		apMac: first("ap", "apMac", "ap_mac"),
		gatewayMac: first("gateway", "gatewayMac", "gateway_mac"),
		ssid: first("ssid", "ssidName", "ssid_name"),
		radioId: asNumber(first("rid", "radioId", "radio_id")),
		vid: asNumber(first("vid")),
		originUrl:
			originUrl && !/^https?:\/\//i.test(originUrl) ? `http://${originUrl}` : originUrl,
	};
}

/**
 * Reads an Omada entry URL such as
 * `http://192.168.1.3:8080/portal/entry?cid=…&ap=…&ssid=…&rid=1&u=…`.
 * Returns null for anything that is not a private-host portal URL, because
 * credentials must never travel to an unrelated host.
 */
export function parsePortalEntry(raw: string): PortalEntry | null {
	const url = normalisePortalUrl(raw);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	if (!isPrivateHost(parsed.hostname)) return null;
	return {
		url: parsed.toString(),
		origin: parsed.origin,
		host: parsed.hostname,
		context: contextFromSearch(parsed.search),
	};
}

/** The JSON body every Omada portal endpoint expects, minus the credentials. */
export function contextFields(context: PortalContext): Record<string, string | number> {
	const fields: Record<string, string | number> = {};
	if (context.clientMac) fields.clientMac = context.clientMac;
	if (context.apMac) fields.apMac = context.apMac;
	if (context.gatewayMac) fields.gatewayMac = context.gatewayMac;
	if (context.ssid) fields.ssidName = context.ssid;
	if (context.originUrl) fields.originUrl = context.originUrl;
	if (context.radioId !== null) fields.radioId = context.radioId;
	if (context.vid !== null) fields.vid = context.vid;
	return fields;
}

export type AuthMethod =
	| { kind: "radius"; authType: number; endpoint: "/portal/radius/auth" }
	| { kind: "local"; authType: 5; endpoint: "/portal/auth" }
	| { kind: "simple"; authType: 1; endpoint: "/portal/auth" }
	| { kind: "none"; authType: 0; endpoint: "/portal/auth" };

export type PortalSetting = {
	authType?: number;
	hotspot?: { enabledTypes?: number[] };
};

export type AuthResolution =
	| { ok: true; method: AuthMethod }
	| { ok: false; reason: string };

/**
 * Maps `authType` to the endpoint and payload shape the controller expects.
 * `11` is hotspot mode, which advertises several methods at once; local beats
 * RADIUS because the campus portal has local users.
 */
export function resolveAuthMethod(setting: PortalSetting | null | undefined): AuthResolution {
	const authType = asNumber(setting?.authType) ?? 0;
	const enabled = Array.isArray(setting?.hotspot?.enabledTypes)
		? setting.hotspot.enabledTypes.map(Number)
		: [];

	switch (authType) {
		case 2:
		case 8:
			return { ok: true, method: { kind: "radius", authType, endpoint: "/portal/radius/auth" } };
		case 5:
			return { ok: true, method: { kind: "local", authType: 5, endpoint: "/portal/auth" } };
		case 1:
			return { ok: true, method: { kind: "simple", authType: 1, endpoint: "/portal/auth" } };
		case 0:
			return { ok: true, method: { kind: "none", authType: 0, endpoint: "/portal/auth" } };
		case 11:
			if (enabled.includes(5)) {
				return { ok: true, method: { kind: "local", authType: 5, endpoint: "/portal/auth" } };
			}
			if (enabled.includes(8)) {
				return {
					ok: true,
					method: { kind: "radius", authType: 8, endpoint: "/portal/radius/auth" },
				};
			}
			if (enabled.includes(3) || enabled.includes(6)) {
				return {
					ok: false,
					reason: "This portal wants a voucher or SMS code, which cannot be automated.",
				};
			}
			return { ok: false, reason: `Unsupported hotspot methods: ${enabled.join(", ") || "none"}.` };
		case 3:
		case 6:
			return {
				ok: false,
				reason: "This portal wants a voucher or SMS code, which cannot be automated.",
			};
		default:
			return { ok: false, reason: `Unsupported portal auth type ${authType}.` };
	}
}

export function authPayload(
	method: AuthMethod,
	context: PortalContext,
	username: string,
	password: string,
): Record<string, string | number> {
	const payload: Record<string, string | number> = {
		...contextFields(context),
		authType: method.authType,
	};
	switch (method.kind) {
		case "radius":
			payload.username = username;
			payload.password = password;
			break;
		case "local":
			payload.localuser = username;
			payload.localuserPsw = password;
			break;
		case "simple":
			payload.simplePassword = password;
			break;
		case "none":
			break;
	}
	return payload;
}

export type LoginFailureKind =
	| "wrong-password"
	| "stale-client"
	| "unknown-user"
	| "rejected"
	| "unsupported"
	| "network";

export type LoginFailure = {
	kind: LoginFailureKind;
	code: number | null;
	message: string;
	/** Whether trying again (now, or on the next tick) can plausibly work. */
	retry: boolean;
	/** Longest sensible wait before the next automatic attempt. */
	cooldownMs: number;
};

/**
 * Omada uses three specific codes and a catch-all for everything else. The
 * distinctions matter: a wrong password must stop immediately, a stale client
 * must re-discover the entry URL, and an unknown user is worth another suffix.
 */
export function classifyErrorCode(code: number | null, message = ""): LoginFailure {
	const detail = message.trim();
	switch (code) {
		case 0:
			return { kind: "rejected", code, message: detail, retry: true, cooldownMs: 0 };
		case -41525:
			return {
				kind: "wrong-password",
				code,
				message: "The portal says the password is wrong.",
				retry: false,
				cooldownMs: 30 * 60_000,
			};
		case -41526:
			return {
				kind: "stale-client",
				code,
				message: "The portal tied this login to an older client address.",
				retry: true,
				cooldownMs: 0,
			};
		case -41527:
			return {
				kind: "unknown-user",
				code,
				message: "The portal does not know this username.",
				retry: true,
				cooldownMs: 0,
			};
		default:
			return {
				kind: "rejected",
				code,
				message: detail || "The portal rejected the login.",
				retry: true,
				cooldownMs: 5 * 60_000,
			};
	}
}

export function networkFailure(message = "The portal could not be reached."): LoginFailure {
	return { kind: "network", code: null, message, retry: true, cooldownMs: 0 };
}

/**
 * Usernames to try, in order. Rotation is the campus convention (001-112), but
 * the exact number the student typed is always the last resort, so a portal
 * that only knows that one account still works.
 */
export function usernameCandidates(
	base: string,
	rotate: boolean,
	random: () => number = Math.random,
	attempts = 3,
): string[] {
	const exact = base.trim();
	if (!exact) return [];
	if (!rotate || !/^\d+$/.test(exact) || exact.length <= PORTAL_ROTATION.digits) return [exact];

	const { digits, min, max } = PORTAL_ROTATION;
	const prefix = exact.slice(0, -digits);
	const seen = new Set<string>([exact]);
	const candidates: string[] = [];

	// A constant `random` (a test stub) must not spin forever.
	for (let guard = 0; guard < 64 && candidates.length < attempts; guard += 1) {
		const suffix = String(min + Math.floor(random() * (max - min + 1))).padStart(digits, "0");
		const candidate = prefix + suffix;
		if (seen.has(candidate)) continue;
		seen.add(candidate);
		candidates.push(candidate);
	}
	candidates.push(exact);
	return candidates;
}

/** 5s, 10s, 20s, 40s, then a minute — the daemon's schedule. */
export function retryDelayMs(failures: number): number {
	const ladder = [5_000, 10_000, 20_000, 40_000, 60_000];
	const index = Math.min(Math.max(failures, 1), ladder.length) - 1;
	return ladder[index];
}

/**
 * True when this page is not allowed to make the request at all, rather than
 * failing when it tries: HTTPS pages cannot open plain-HTTP connections.
 */
export function isMixedContentBlocked(pageUrl: string, targetUrl: string): boolean {
	try {
		const page = new URL(pageUrl);
		const target = new URL(targetUrl);
		return page.protocol === "https:" && target.protocol === "http:";
	} catch {
		return false;
	}
}

export type PortalFetchResponse = {
	ok: boolean;
	status: number;
	text(): Promise<string>;
};

export type PortalFetch = (url: string, init: RequestInit) => Promise<PortalFetchResponse>;

export type LoginOptions = {
	origin: string;
	context: PortalContext;
	username: string;
	password: string;
	rotate?: boolean;
	fetchImpl?: PortalFetch;
	timeoutMs?: number;
	random?: () => number;
};

export type LoginOutcome =
	| { ok: true; method: AuthMethod["kind"]; authType: number; username: string }
	| { ok: false; failure: LoginFailure; username: string | null };

function parseJson(text: string): Record<string, unknown> | null {
	if (!text.trim()) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

async function postJson(
	fetchImpl: PortalFetch,
	url: string,
	body: unknown,
	timeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"X-Requested-With": "XMLHttpRequest",
			},
			body: JSON.stringify(body),
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
		});
		const text = await response.text();
		return { status: response.status, json: parseJson(text) };
	} finally {
		clearTimeout(timer);
	}
}

function resultOf(json: Record<string, unknown> | null): PortalSetting | null {
	const raw = json?.result;
	if (!raw) return null;
	// Some controller builds double-encode `result` as a JSON string.
	const parsed = typeof raw === "string" ? parseJson(raw) : (raw as Record<string, unknown>);
	if (!parsed) return null;
	return {
		authType: asNumber(parsed.authType) ?? undefined,
		hotspot: parsed.hotspot as PortalSetting["hotspot"],
	};
}

/**
 * One full login attempt, start to finish. The caller decides whether the
 * origin is reachable (same-origin page, or an extension doing the request).
 */
export async function loginToPortal(options: LoginOptions): Promise<LoginOutcome> {
	const {
		origin,
		context,
		username,
		password,
		rotate = true,
		fetchImpl = fetch as unknown as PortalFetch,
		timeoutMs = 8_000,
		random = Math.random,
	} = options;

	const settingUrl = `${origin}/portal/getPortalPageSetting`;
	let setting: Awaited<ReturnType<typeof postJson>>;
	try {
		setting = await postJson(fetchImpl, settingUrl, contextFields(context), timeoutMs);
	} catch (error) {
		return {
			ok: false,
			failure: networkFailure(
				error instanceof Error && error.name === "AbortError"
					? "The portal took too long to answer."
					: "The portal could not be reached from this page.",
			),
			username: null,
		};
	}

	const settingCode = asNumber(setting.json?.errorCode);
	if (settingCode !== null && settingCode !== 0) {
		return {
			ok: false,
			failure: classifyErrorCode(settingCode, asText(setting.json?.msg)),
			username: null,
		};
	}

	const resolution = resolveAuthMethod(resultOf(setting.json));
	if (!resolution.ok) {
		return {
			ok: false,
			failure: {
				kind: "unsupported",
				code: null,
				message: resolution.reason,
				retry: false,
				cooldownMs: 10 * 60_000,
			},
			username: null,
		};
	}

	const { method } = resolution;
	const candidates = usernameCandidates(username, rotate && method.kind !== "simple", random);
	const attempts = candidates.length > 0 ? candidates : [username];
	let last: LoginFailure = classifyErrorCode(null, "The portal did not answer.");

	for (const candidate of attempts) {
		let response: Awaited<ReturnType<typeof postJson>>;
		try {
			response = await postJson(
				fetchImpl,
				origin + method.endpoint,
				authPayload(method, context, candidate, password),
				timeoutMs,
			);
		} catch {
			return { ok: false, failure: networkFailure(), username: candidate };
		}

		const code = asNumber(response.json?.errorCode);
		const message = asText(response.json?.msg);
		const accepted = code === 0 || (code === null && /^success\b/i.test(message.trim()));
		if (accepted) {
			return { ok: true, method: method.kind, authType: method.authType, username: candidate };
		}

		last = classifyErrorCode(code, message);
		// Only "unknown user" is worth spending another suffix on.
		if (last.kind !== "unknown-user") break;
	}

	return { ok: false, failure: last, username: attempts[attempts.length - 1] ?? null };
}
