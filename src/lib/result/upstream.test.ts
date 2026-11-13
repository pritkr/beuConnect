import { describe, expect, it } from "vitest";
import { classifyUpstream, isTransientUpstreamFailure } from "./upstream";

describe("classifyUpstream", () => {
	it("reads the portal's captcha gate as captcha", () => {
		expect(
			classifyUpstream(403, '{"message":"CAPTCHA verification required."}'),
		).toBe("captcha");
	});

	it("recognises a challenge widget in an HTML body", () => {
		expect(
			classifyUpstream(403, '<div class="cf-turnstile" data-sitekey="x"></div>'),
		).toBe("captcha");
	});

	it("treats a plain 403 as auth, not captcha", () => {
		expect(classifyUpstream(403, '{"message":"Access denied."}')).toBe("auth");
		expect(classifyUpstream(401, "")).toBe("auth");
	});

	it("classifies 429 as rate_limit", () => {
		expect(classifyUpstream(429, "Too many requests")).toBe("rate_limit");
	});

	it("classifies every 5xx as server", () => {
		expect(classifyUpstream(500, "")).toBe("server");
		expect(classifyUpstream(502, "Bad gateway")).toBe("server");
		expect(classifyUpstream(503, "CAPTCHA")).toBe("server");
	});

	it("classifies anything else as unknown", () => {
		expect(classifyUpstream(200, "captcha")).toBe("unknown");
		expect(classifyUpstream(404, "Not found")).toBe("unknown");
	});

	it("retries only transport and server failures", () => {
		expect(isTransientUpstreamFailure("network")).toBe(true);
		expect(isTransientUpstreamFailure("server")).toBe(true);
		expect(isTransientUpstreamFailure("captcha")).toBe(false);
		expect(isTransientUpstreamFailure("auth")).toBe(false);
		expect(isTransientUpstreamFailure("rate_limit")).toBe(false);
		expect(isTransientUpstreamFailure("unknown")).toBe(false);
	});
});
