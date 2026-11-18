/**
 * GA4 for the site: one page_view per load, plus the events that tell us which
 * feature a student actually used.
 *
 * Three rules shape this file:
 *
 *  1. **No PII, ever.** Registration numbers travel in our query strings
 *     (`/result?reg=22105123019`), so `page_location` is rebuilt from origin +
 *     path and the query is dropped. Parameter values are scrubbed of long
 *     digit runs for the same reason.
 *  2. **Never wait on GA.** `gtag` queues into `dataLayer` before the library
 *     loads, so a slow or blocked googletagmanager.com costs nothing.
 *  3. **One place to opt out.** `navigator.globalPrivacyControl`, Do Not Track
 *     and the stored `beu_analytics_optout` flag all silence every call,
 *     including the page_view.
 *
 * Markup opts in with `data-ga` attributes instead of bespoke listeners:
 *
 *   <a href="/pyqs" data-ga="feature_open" data-ga-params='{"feature":"pyqs"}'>
 *
 * `data-ga-feature`, `data-ga-label` and `data-ga-value` are shorthand for the
 * params of the same name. Outside links and file downloads are tracked
 * without any markup at all.
 */

import { EVENTS } from "./events";
import { featureOf, pageTypeOf } from "./feature";
import { contextOf, forgetProfile } from "./context";

export { EVENTS, EVENT_NAMES } from "./events";
export { featureOf, pageTypeOf } from "./feature";
export type { Feature, PageType } from "./feature";

export type ParamValue = string | number | boolean | null | undefined;
export type Params = Record<string, ParamValue>;

interface GtagWindow extends Window {
	gtag?: (...args: unknown[]) => void;
	dataLayer?: unknown[];
	/**
	 * `define:vars` scripts are inlined by Astro and cannot import, so page
	 * scripts reach the tracker through this one function instead:
	 * `window.beuTrack?.("feedback_submit", { type })`.
	 */
	beuTrack?: (name: string, params?: Params) => void;
}

/** The GA4 web stream. Empty means "analytics is not configured here". */
export const GA_MEASUREMENT_ID = String(
	import.meta.env.PUBLIC_GA_MEASUREMENT_ID ?? "",
).trim();

const OPT_OUT_KEY = "beu_analytics_optout";
const MAX_PARAMS = 25;
const MAX_STRING = 100;

let ready = false;
let optedOut = false;
let lastPageView = "";

/* ---------------------------------------------------------------- opt-out */

function readOptOut(): boolean {
	try {
		return localStorage.getItem(OPT_OUT_KEY) === "1";
	} catch {
		return false;
	}
}

function browserOptedOut(): boolean {
	if (typeof navigator === "undefined") return true;
	const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
	if (nav.globalPrivacyControl === true) return true;
	const dnt = nav.doNotTrack;
	return dnt === "1" || dnt === "yes";
}

/** Silences analytics without a reload, and remembers the choice. */
export function setAnalyticsOptOut(optOut: boolean): void {
	optedOut = optOut;
	try {
		if (optOut) localStorage.setItem(OPT_OUT_KEY, "1");
		else localStorage.removeItem(OPT_OUT_KEY);
	} catch {
		/* private mode: the in-memory flag still applies */
	}
}

export function analyticsOptedOut(): boolean {
	return optedOut || browserOptedOut();
}

/* ------------------------------------------------------------------ track */

/**
 * Sends one GA4 event. Safe to call before the library exists and on a page
 * where analytics is disabled: it just queues or does nothing.
 */
export function track(name: string, params: Params = {}): void {
	if (!GA_MEASUREMENT_ID || analyticsOptedOut()) return;
	const win = window as GtagWindow;
	if (typeof win.gtag !== "function") return;
	// Every event carries the page context (surface, branch, sem, subject…), so a
	// click is readable without joining it back to the page_view.
	const safe = sanitize({
		...contextOf(window.location.pathname, new URLSearchParams(window.location.search)),
		feature: featureOf(window.location.pathname),
		...params,
	});
	if (Object.keys(safe).length > 0) win.gtag("event", name, safe);
	else win.gtag("event", name);
}

/** Where we are, with the query stripped so no registration number leaks. */
function locationOf(href: string): string {
	try {
		const url = new URL(href);
		return `${url.origin}${url.pathname}`;
	} catch {
		return "";
	}
}

/**
 * Fires the single page_view for this load. `send_page_view` is off in the
 * config tag because GA4's automatic one would carry the raw query string and
 * none of our feature dimensions.
 */
export function trackPageView(force = false): void {
	if (!GA_MEASUREMENT_ID || analyticsOptedOut()) return;
	const win = window as GtagWindow;
	if (typeof win.gtag !== "function") return;

	const path = window.location.pathname;
	if (!force && lastPageView === path) return;
	lastPageView = path;

	win.gtag("event", EVENTS.pageView, {
		page_location: `${window.location.origin}${path}`,
		page_title: document.title,
		page_referrer: document.referrer ? locationOf(document.referrer) : "",
		feature: featureOf(path),
		page_type: pageTypeOf(path),
		...sanitize(contextOf(path, new URLSearchParams(window.location.search))),
	});
}

/* ---------------------------------------------------------------- scrub */

const LONG_DIGITS = /\d{6,}/g;

function sanitize(params: Params): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	let count = 0;
	for (const key of Object.keys(params)) {
		if (count >= MAX_PARAMS) break;
		if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
		const value = params[key];
		if (value === undefined || value === null) continue;
		if (typeof value === "number") {
			if (!Number.isFinite(value)) continue;
			out[key] = value;
		} else if (typeof value === "boolean") {
			out[key] = value;
		} else {
			// `student` is already a hash; scrubbing it would mangle the rare hex
			// string that happens to contain six digits in a row.
			const clean = key === "student" ? String(value).slice(0, MAX_STRING) : scrub(String(value));
			if (!clean) continue;
			out[key] = clean;
		}
		count += 1;
	}
	return out;
}

/**
 * Keeps a value useful but anonymous: registration numbers and phone numbers
 * are digit runs, and a dimension we cannot report on is worse than no value.
 */
function scrub(value: string): string {
	return value
		.replace(LONG_DIGITS, "[redacted]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_STRING);
}

/* ------------------------------------------------------------- delegation */

const FILE_EXTENSIONS = new Set([
	"pdf",
	"zip",
	"csv",
	"xls",
	"xlsx",
	"doc",
	"docx",
	"ppt",
	"pptx",
	"apk",
	"txt",
]);

function paramsOf(element: Element): Params {
	const params: Params = {};
	const feature = element.getAttribute("data-ga-feature");
	const label = element.getAttribute("data-ga-label");
	const value = element.getAttribute("data-ga-value");
	if (feature) params.feature = feature;
	if (label) params.label = label;
	if (value) params.value = value;
	const json = element.getAttribute("data-ga-params");
	if (json) {
		try {
			const parsed = JSON.parse(json) as Record<string, ParamValue>;
			if (parsed && typeof parsed === "object") Object.assign(params, parsed);
		} catch {
			/* a typo in markup must never break a click */
		}
	}
	return params;
}

function onClick(event: MouseEvent): void {
	if (event.defaultPrevented) return;
	// Modified clicks open a new tab; that is still the student using the
	// feature, so every button count is tracked rather than skipped.
	const target = event.target;
	if (!(target instanceof Element)) return;
	const el = target.closest("[data-ga],a[href]");
	if (!el) return;

	const explicit = el.getAttribute("data-ga");
	if (explicit) {
		track(explicit, {
			feature: featureOf(window.location.pathname),
			...paramsOf(el),
		});
		return;
	}

	if (!(el instanceof HTMLAnchorElement)) return;
	const href = el.getAttribute("href") ?? "";
	if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
		return;
	}

	let url: URL;
	try {
		url = new URL(href, window.location.href);
	} catch {
		return;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return;

	const extension = url.pathname.split(".").pop()?.toLowerCase() ?? "";
	const isFile = FILE_EXTENSIONS.has(extension);

	if (isFile) {
		track(EVENTS.fileDownload, {
			file_name: url.pathname.split("/").pop() ?? "",
			file_extension: extension,
			link_url: locationOf(url.href) || url.origin,
			link_domain: url.hostname,
			feature: featureOf(window.location.pathname),
		});
		return;
	}

	if (url.origin !== window.location.origin) {
		track(EVENTS.outboundClick, {
			link_domain: url.hostname,
			link_url: locationOf(url.href) || url.origin,
			feature: featureOf(window.location.pathname),
		});
	}
}

/** Wires the document listeners once, after the first paint. */
export function initAnalytics(): void {
	if (ready || typeof window === "undefined") return;
	ready = true;
	optedOut = readOptOut();
	(window as GtagWindow).beuTrack = track;

	document.addEventListener("click", onClick, { capture: true, passive: true });

	// Saving or clearing the registration number changes branch, semester and
	// batch; the next event should read the new profile, not the old one.
	window.addEventListener("beu_profile_updated", forgetProfile);

	// Forms opt in with `data-ga` on the form; the submit is the meaningful act,
	// not the click on the button that happens to be inside it.
	document.addEventListener(
		"submit",
		(event) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement)) return;
			const name = form.getAttribute("data-ga");
			if (!name) return;
			track(name, {
				feature: featureOf(window.location.pathname),
				...paramsOf(form),
			});
		},
		{ capture: true, passive: true },
	);

	trackPageView();

	// The site is multi-page today, so each navigation is a fresh load and the
	// line above is enough. If a client-side router is added later, this catches
	// it: `astro:page-load` also fires on the first load, where the path dedupe
	// keeps it to one page_view.
	document.addEventListener("astro:page-load", () => trackPageView());

	// Astro's cross-document view transitions swap the document on back/forward
	// cache restores without a fresh module run; re-fire so History navigation
	// is visible too. `lastPageView` keeps it to one per path.
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) trackPageView(true);
	});
}
