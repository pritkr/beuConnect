import { describe, expect, it } from "vitest";
import {
	EMPTY_CONTEXT,
	authPayload,
	classifyErrorCode,
	contextFields,
	isMixedContentBlocked,
	isPrivateHost,
	loginToPortal,
	normalisePortalUrl,
	parsePortalEntry,
	resolveAuthMethod,
	retryDelayMs,
	usernameCandidates,
} from "./omada";
import type { PortalContext, PortalFetch } from "./omada";

const context: PortalContext = {
	clientMac: "aa-bb-cc-dd-ee-ff",
	apMac: "11-22-33-44-55-66",
	gatewayMac: "",
	ssid: "GEC-WiFi",
	radioId: 1,
	vid: null,
	originUrl: "http://example.com/",
};

/** Records every call and answers from a script of (url suffix -> body). */
function fakeFetch(script: Array<{ match: string; body: unknown; status?: number }>): {
	fetch: PortalFetch;
	calls: Array<{ url: string; body: Record<string, unknown> }>;
} {
	const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
	const impl: PortalFetch = async (url, init) => {
		calls.push({ url, body: JSON.parse(String(init.body)) });
		const hit = script.find((entry) => url.endsWith(entry.match));
		const payload = hit ? hit.body : { errorCode: 0, msg: "success." };
		return {
			ok: (hit?.status ?? 200) < 400,
			status: hit?.status ?? 200,
			text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
		};
	};
	return { fetch: impl, calls };
}

describe("isPrivateHost", () => {
	it("accepts the ranges a campus gateway can live in", () => {
		for (const host of ["192.168.1.3", "10.0.0.1", "172.16.4.2", "172.31.255.254", "127.0.0.1"]) {
			expect(isPrivateHost(host), host).toBe(true);
		}
	});

	it("rejects public hosts and names", () => {
		for (const host of ["8.8.8.8", "172.32.0.1", "192.169.1.1", "portal.example.com", ""]) {
			expect(isPrivateHost(host), host).toBe(false);
		}
	});
});

describe("portal entry URLs", () => {
	const raw =
		"https:\\/\\/192.168.1.3:8843\\/portal\\/entry?cid=aa-bb-cc-dd-ee-ff&amp;ap=11-22-33-44-55-66&ssid=GEC-WiFi&rid=1&u=http%3A%2F%2Fexample.com%2F";

	it("undoes the escaping controllers add", () => {
		expect(normalisePortalUrl(raw)).toBe(
			"https://192.168.1.3:8843/portal/entry?cid=aa-bb-cc-dd-ee-ff&ap=11-22-33-44-55-66&ssid=GEC-WiFi&rid=1&u=http%3A%2F%2Fexample.com%2F",
		);
	});

	it("extracts the client context the controller expects", () => {
		const entry = parsePortalEntry(raw);
		expect(entry).not.toBeNull();
		expect(entry?.origin).toBe("https://192.168.1.3:8843");
		expect(entry?.host).toBe("192.168.1.3");
		expect(entry?.context).toEqual({
			clientMac: "aa-bb-cc-dd-ee-ff",
			apMac: "11-22-33-44-55-66",
			gatewayMac: "",
			ssid: "GEC-WiFi",
			radioId: 1,
			vid: null,
			originUrl: "http://example.com/",
		});
	});

	it("refuses a public host so credentials cannot be sent off-network", () => {
		expect(parsePortalEntry("https://portal.evil.example/portal/entry?cid=1")).toBeNull();
	});

	it("keeps a bare gateway origin usable", () => {
		const entry = parsePortalEntry("http://192.168.1.3/");
		expect(entry?.origin).toBe("http://192.168.1.3");
		expect(entry?.context).toEqual(EMPTY_CONTEXT);
	});
});

describe("contextFields", () => {
	it("drops empty values and keeps numbers as numbers", () => {
		expect(contextFields(context)).toEqual({
			clientMac: "aa-bb-cc-dd-ee-ff",
			apMac: "11-22-33-44-55-66",
			ssidName: "GEC-WiFi",
			originUrl: "http://example.com/",
			radioId: 1,
		});
	});
});

describe("resolveAuthMethod", () => {
	it("maps the username/password methods", () => {
		expect(resolveAuthMethod({ authType: 5 })).toEqual({
			ok: true,
			method: { kind: "local", authType: 5, endpoint: "/portal/auth" },
		});
		expect(resolveAuthMethod({ authType: 8 })).toEqual({
			ok: true,
			method: { kind: "radius", authType: 8, endpoint: "/portal/radius/auth" },
		});
		expect(resolveAuthMethod({ authType: 1 })).toEqual({
			ok: true,
			method: { kind: "simple", authType: 1, endpoint: "/portal/auth" },
		});
		expect(resolveAuthMethod({ authType: 0 })).toEqual({
			ok: true,
			method: { kind: "none", authType: 0, endpoint: "/portal/auth" },
		});
	});

	it("prefers a local user in hotspot mode", () => {
		const result = resolveAuthMethod({ authType: 11, hotspot: { enabledTypes: [8, 5] } });
		expect(result.ok && result.method.kind).toBe("local");
	});

	it("refuses voucher and SMS portals instead of pretending", () => {
		for (const setting of [{ authType: 3 }, { authType: 6 }, { authType: 11, hotspot: { enabledTypes: [3] } }]) {
			const result = resolveAuthMethod(setting);
			expect(result.ok).toBe(false);
		}
	});
});

describe("authPayload", () => {
	it("uses each method's own field names", () => {
		expect(authPayload({ kind: "local", authType: 5, endpoint: "/portal/auth" }, context, "24105157049", "123456")).toMatchObject({
			authType: 5,
			localuser: "24105157049",
			localuserPsw: "123456",
			clientMac: "aa-bb-cc-dd-ee-ff",
		});
		expect(authPayload({ kind: "radius", authType: 2, endpoint: "/portal/radius/auth" }, context, "24105157049", "123456")).toMatchObject({
			username: "24105157049",
			password: "123456",
		});
		expect(authPayload({ kind: "simple", authType: 1, endpoint: "/portal/auth" }, context, "ignored", "123456")).toMatchObject({
			simplePassword: "123456",
		});
	});
});

describe("usernameCandidates", () => {
	it("rotates the trailing digits and always ends on the exact number", () => {
		const candidates = usernameCandidates("24105157049", true, () => 0);
		expect(candidates[0]).toBe("24105157001");
		expect(candidates.at(-1)).toBe("24105157049");
		expect(candidates.every((value) => value.startsWith("24105157"))).toBe(true);
	});

	it("respects the configured bounds", () => {
		const values = new Set<string>();
		for (let index = 0; index < 200; index += 1) {
			for (const candidate of usernameCandidates("24105157049", true, Math.random)) values.add(candidate);
		}
		const suffixes = [...values].map((value) => Number(value.slice(-3)));
		expect(Math.min(...suffixes)).toBeGreaterThanOrEqual(1);
		expect(Math.max(...suffixes)).toBeLessThanOrEqual(112);
	});

	it("leaves the number alone when rotation is off or the number is not numeric", () => {
		expect(usernameCandidates("24105157049", false)).toEqual(["24105157049"]);
		expect(usernameCandidates("student-1", true)).toEqual(["student-1"]);
		expect(usernameCandidates("", true)).toEqual([]);
	});
});

describe("retryDelayMs", () => {
	it("backs off to a minute and stays there", () => {
		expect([1, 2, 3, 4, 5, 50].map(retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
	});
});

describe("classifyErrorCode", () => {
	it("separates the three codes the controller uses", () => {
		expect(classifyErrorCode(-41525)).toMatchObject({ kind: "wrong-password", retry: false });
		expect(classifyErrorCode(-41526)).toMatchObject({ kind: "stale-client", retry: true });
		expect(classifyErrorCode(-41527)).toMatchObject({ kind: "unknown-user", retry: true });
		expect(classifyErrorCode(-1, "boom")).toMatchObject({ kind: "rejected", message: "boom" });
	});
});

describe("isMixedContentBlocked", () => {
	it("reports the reason a deployed HTTPS page cannot log in", () => {
		expect(isMixedContentBlocked("https://beu.prit.eu.org/wifi", "http://192.168.1.3/")).toBe(true);
		expect(isMixedContentBlocked("http://192.168.1.3/portal/entry", "http://192.168.1.3/portal/auth")).toBe(false);
	});
});

describe("loginToPortal", () => {
	it("walks the setting endpoint, then local auth, and reports success", async () => {
		const { fetch, calls } = fakeFetch([
			{ match: "/portal/getPortalPageSetting", body: { errorCode: 0, result: { authType: 5 } } },
			{ match: "/portal/auth", body: { errorCode: 0, msg: "success." } },
		]);

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "123456",
			fetchImpl: fetch,
			random: () => 0,
		});

		expect(outcome).toEqual({
			ok: true,
			method: "local",
			authType: 5,
			username: "24105157001",
		});
		expect(calls.map((call) => call.url)).toEqual([
			"http://192.168.1.3/portal/getPortalPageSetting",
			"http://192.168.1.3/portal/auth",
		]);
		expect(calls[1].body).toMatchObject({
			authType: 5,
			localuser: "24105157001",
			localuserPsw: "123456",
			clientMac: "aa-bb-cc-dd-ee-ff",
		});
	});

	it("spends another suffix when the controller says the user does not exist", async () => {
		const answers = [
			{ errorCode: 0, result: { authType: 2 } },
			{ errorCode: -41527, msg: "invalid user" },
			{ errorCode: 0, msg: "success." },
		];
		const users: string[] = [];
		let index = 0;
		const impl: PortalFetch = async (_url, init) => {
			const body = JSON.parse(String(init.body)) as { username?: string };
			if (body.username) users.push(body.username);
			const answer = answers[index++] ?? answers.at(-1);
			return { ok: true, status: 200, text: async () => JSON.stringify(answer) };
		};

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "123456",
			fetchImpl: impl,
			random: () => 0,
		});

		expect(outcome.ok).toBe(true);
		expect(users).toHaveLength(2);
		expect(users[0]).not.toBe(users[1]);
		expect(users[0]).toMatch(/^24105157\d{3}$/);
	});

	it("stops on the first wrong password instead of burning the quota", async () => {
		const { fetch, calls } = fakeFetch([
			{ match: "/portal/getPortalPageSetting", body: { errorCode: 0, result: { authType: 5 } } },
			{ match: "/portal/auth", body: { errorCode: -41525, msg: "wrong password" } },
		]);

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "nope",
			fetchImpl: fetch,
		});

		expect(outcome.ok).toBe(false);
		expect(!outcome.ok && outcome.failure.kind).toBe("wrong-password");
		expect(calls.filter((call) => call.url.endsWith("/portal/auth"))).toHaveLength(1);
	});

	it("asks for a fresh URL when the controller says the client is stale", async () => {
		const { fetch } = fakeFetch([
			{ match: "/portal/getPortalPageSetting", body: { errorCode: 0, result: { authType: 5 } } },
			{ match: "/portal/auth", body: { errorCode: -41526, msg: "invalid client" } },
		]);

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "123456",
			fetchImpl: fetch,
		});

		expect(!outcome.ok && outcome.failure.kind).toBe("stale-client");
	});

	it("survives a controller that double-encodes result and sends errorCode as a string", async () => {
		const { fetch } = fakeFetch([
			{
				match: "/portal/getPortalPageSetting",
				body: { errorCode: "0", result: JSON.stringify({ authType: "5" }) },
			},
			{ match: "/portal/auth", body: { errorCode: "0", msg: "success." } },
		]);

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "123456",
			fetchImpl: fetch,
		});

		expect(outcome.ok).toBe(true);
	});

	it("reports an unreachable portal as a network failure", async () => {
		const impl: PortalFetch = async () => {
			throw new TypeError("Failed to fetch");
		};

		const outcome = await loginToPortal({
			origin: "http://192.168.1.3",
			context,
			username: "24105157049",
			password: "123456",
			fetchImpl: impl,
		});

		expect(!outcome.ok && outcome.failure.kind).toBe("network");
	});
});
