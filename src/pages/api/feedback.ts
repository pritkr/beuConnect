import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

const ALLOWED_TYPES = new Set(["bug", "wrong-data", "feature", "other"]);

type FeedbackPayload = {
	type?: unknown;
	message?: unknown;
	regNo?: unknown;
	contact?: unknown;
	page?: unknown;
	context?: unknown;
	hp?: unknown;
	// turnstileToken?: unknown;
};

function getWorkerEnv() {
	return env as unknown as Record<string, string | undefined>;
}

function json(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function cleanSingleLine(value: unknown, maxLength: number) {
	if (typeof value !== "string") return "";
	return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiLine(value: unknown, maxLength: number) {
	if (typeof value !== "string") return "";
	return value
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.trim()
		.slice(0, maxLength);
}

function formatFeedbackMessage(payload: {
	type: string;
	message: string;
	regNo: string;
	contact: string;
	page: string;
	context: string;
	ip: string;
	userAgent: string;
	timestamp: string;
}) {
	const sections = [
		"BEUConnect feedback",
		`Type: ${payload.type}`,
		`Page: ${payload.page || "unknown"}`,
		`Context: ${payload.context || "none"}`,
		`Reg No: ${payload.regNo || "not provided"}`,
		`Contact: ${payload.contact || "not provided"}`,
		`IP: ${payload.ip || "unknown"}`,
		`User Agent: ${payload.userAgent || "unknown"}`,
		`Time: ${payload.timestamp}`,
		"",
		"Message:",
		payload.message,
	];

	return sections.join("\n");
}

async function sendTelegramMessage(text: string) {
	const workerEnv = getWorkerEnv();
	const botToken = workerEnv.TELEGRAM_BOT_TOKEN;
	const chatId = workerEnv.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		throw new Error("Feedback channel is not configured yet.");
	}

	const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			chat_id: chatId,
			text,
			disable_web_page_preview: true,
		}),
	});

	const result = (await response.json().catch(() => null)) as
		| { ok?: boolean; description?: string }
		| null;
	if (!response.ok || !result?.ok) {
		throw new Error(result?.description || "Telegram rejected the feedback message.");
	}
	return result;
}

/*
type TurnstileVerifyResult = {
	success?: boolean;
	"error-codes"?: string[];
};

async function verifyTurnstileToken(token: string, ip: string) {
	const workerEnv = getWorkerEnv();
	const secret = workerEnv.TURNSTILE_SECRET_KEY;

	if (!secret) {
		throw new Error("Turnstile secret is not configured yet.");
	}

	const formData = new FormData();
	formData.append("secret", secret);
	formData.append("response", token);
	if (ip) {
		formData.append("remoteip", ip);
	}

	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		body: formData,
	});
	const result = (await response.json().catch(() => null)) as TurnstileVerifyResult | null;

	if (!response.ok || !result?.success) {
		const errors = result?.["error-codes"]?.join(", ") || "verification failed";
		throw new Error(errors);
	}

	return result;
}
*/

export const POST: APIRoute = async ({ request }) => {
	let payload: FeedbackPayload;

	try {
		payload = (await request.json()) as FeedbackPayload;
	} catch {
		return json(400, { ok: false, message: "Invalid feedback payload." });
	}

	if (cleanSingleLine(payload.hp, 120)) {
		return json(200, { ok: true, message: "Sent. I'll check this." });
	}

	const type = cleanSingleLine(payload.type, 32);
	const safeType = ALLOWED_TYPES.has(type) ? type : "other";
	const message = cleanMultiLine(payload.message, 1200);
	const regNo = cleanSingleLine(payload.regNo, 20).replace(/[^0-9A-Za-z/-]/g, "");
	const contact = cleanSingleLine(payload.contact, 80);
	const page = cleanSingleLine(payload.page, 240);
	const context = cleanSingleLine(payload.context, 120);
	// const turnstileToken = cleanSingleLine(payload.turnstileToken, 4096);

	if (message.length < 10) {
		return json(400, { ok: false, message: "Please include a bit more detail." });
	}

	const ip = cleanSingleLine(
		request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "",
		80,
	);
	const userAgent = cleanSingleLine(request.headers.get("user-agent") || "", 240);
	const timestamp = new Date().toISOString();

	// Turnstile restore:
	// if (!turnstileToken) {
	// 	return json(400, { ok: false, message: "Verification token missing. Please try again." });
	// }

	try {
		// await verifyTurnstileToken(turnstileToken, ip);
		await sendTelegramMessage(
			formatFeedbackMessage({
				type: safeType,
				message,
				regNo,
				contact,
				page,
				context,
				ip,
				userAgent,
				timestamp,
			}),
		);
		return json(200, { ok: true, message: "Sent. I'll check this." });
	} catch (error) {
		console.error("feedback delivery failed", error);
		const message = error instanceof Error ? error.message : "";
		if (message === "Feedback channel is not configured yet.") {
			return json(503, {
				ok: false,
				message: "Feedback is not configured on this deployment yet.",
			});
		}
		if (message) {
			return json(503, {
				ok: false,
				message: `Feedback delivery failed: ${message}`,
			});
		}
		return json(503, {
			ok: false,
			message: "Feedback is unavailable right now. Try again in a bit.",
		});
	}
};
