/**
 * Classification of BEU upstream responses. Pure and dependency-free so the
 * retry policy and the user-facing failure code are decided from data, not
 * from a free-form error string.
 */

export type UpstreamClass = "captcha" | "rate_limit" | "server" | "auth" | "unknown";

/** A transport-level failure (DNS, TCP, TLS, timeout) is one more outcome than
 * an HTTP response can express, so callers may see it alongside the classes. */
export type UpstreamFailureKind = UpstreamClass | "network";

const CAPTCHA_PATTERN = /captcha|verification required|turnstile|recaptcha/i;

export function classifyUpstream(status: number, body: string): UpstreamClass {
	const text = typeof body === "string" ? body : "";

	if (status === 401 || status === 403) {
		// A gate that asks for a challenge is a captcha, not a credential problem.
		return CAPTCHA_PATTERN.test(text) ? "captcha" : "auth";
	}
	if (status === 429) return "rate_limit";
	if (status >= 500 && status <= 599) return "server";
	return "unknown";
}

export function isTransientUpstreamFailure(kind: UpstreamFailureKind): boolean {
	return kind === "network" || kind === "server";
}
