import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookmarkletCode, bookmarkletHref } from "./bookmarklet";
import { PORTAL_DEFAULT_HOST, PORTAL_DEFAULT_PASSWORD, PORTAL_DEFAULT_USERNAME } from "./omada";

const userscript = readFileSync(
	new URL("../../../public/wifi/omada-autologin.user.js", import.meta.url),
	"utf8",
);

describe("bookmarklet", () => {
	const code = bookmarkletCode();

	it("is valid JavaScript", () => {
		expect(() => new Function(code)).not.toThrow();
	});

	it("carries the shared account so nothing has to be typed", () => {
		expect(code).toContain(`var H = ${JSON.stringify(PORTAL_DEFAULT_HOST)}`);
		expect(code).toContain(`var U = ${JSON.stringify(PORTAL_DEFAULT_USERNAME)}`);
		expect(code).toContain(`var P = ${JSON.stringify(PORTAL_DEFAULT_PASSWORD)}`);
	});

	it("never closes the surrounding script tag", () => {
		expect(code.toLowerCase()).not.toContain("</script");
		expect(bookmarkletHref().toLowerCase()).not.toContain("</script");
	});

	it("stays small enough to live in a bookmark", () => {
		expect(code.length).toBeLessThan(6000);
	});

	it("round-trips through the href encoding", () => {
		const href = bookmarkletHref({ password: "a b#c%25'd" });
		expect(href.startsWith("javascript:")).toBe(true);
		expect(decodeURIComponent(href.slice("javascript:".length))).toBe(
			bookmarkletCode({ password: "a b#c%25'd" }),
		);
	});

	it("lets rotation be turned off", () => {
		expect(bookmarkletCode({ rotate: false })).toContain("ROT = false");
	});
});

describe("userscript", () => {
	it("is valid JavaScript", () => {
		expect(() => new Function(userscript)).not.toThrow();
	});

	it("declares the metadata a manager needs to install and update it", () => {
		expect(userscript).toContain("// ==UserScript==");
		expect(userscript).toContain("// ==/UserScript==");
		expect(userscript).toContain("// @match        *://*/*");
		expect(userscript).toContain("// @noframes");
		expect(userscript).toContain("// @grant        GM_xmlhttpRequest");
		expect(userscript).toContain("// @updateURL    https://beu.prit.eu.org/wifi/omada-autologin.user.js");
	});

	it("ships the same account as the page", () => {
		expect(userscript).toContain(`username: "${PORTAL_DEFAULT_USERNAME}"`);
		expect(userscript).toContain(`password: "${PORTAL_DEFAULT_PASSWORD}"`);
		expect(userscript).toContain(`host: "${PORTAL_DEFAULT_HOST}"`);
	});

	it("only talks to private hosts", () => {
		expect(userscript).toContain("function isPrivateHost");
		expect(userscript).toContain("Refusing a non-campus host");
	});
});
