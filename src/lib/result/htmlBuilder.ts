import type { ResultPayload, SubjectRow, ViewMode } from "./types";
import { normalizeFailedSubjects, getLegacyDocumentBase, absolutizeAssetUrls } from "./parser";
import { OFFICIAL_PORTAL_URL, type OfficialExamStatus } from "./portal";

export const MODERN_CSS = `
<style>
	/* Restyles BEU's own result markup into the site's "exam desk" system:
	   Instrument Serif display, Public Sans body, marigold marker, hairlines.
	   Same palette as the site sheet, so a shared card reads as BEUConnect. */
	@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Public+Sans:wght@400;500;600;700&display=swap');

	:root {
		color-scheme: dark;
		--bg: #151b18;
		--fg: #e7e1d5;
		--muted: #cac4b6;
		--faint: #a5a399;
		--card: #1d2520;
		--card-2: #252f29;
		--border: #3a4941;
		--accent: #e3a049;
		--accent-2: #e3a049;
		--accent-ink: #1a1206;
		--accent-soft: rgba(227, 160, 73, 0.13);
		--danger: #e88a78;
		--danger-bg: rgba(232, 138, 120, 0.12);
		--shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		--sans: "Public Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
		--serif: "Instrument Serif", "Iowan Old Style", "Palatino Linotype", serif;
	}

	[data-theme="light"] {
		color-scheme: light;
		--bg: #f6f2e8;
		--fg: #14201a;
		--muted: #4a564d;
		--faint: #5f6a61;
		--card: #fdfaf2;
		--card-2: #efe9dc;
		--border: #ded5c3;
		--accent: #935400;
		--accent-2: #935400;
		--accent-ink: #fffaf0;
		--accent-soft: rgba(147, 84, 0, 0.1);
		--danger: #a33a26;
		--danger-bg: rgba(163, 58, 38, 0.08);
		--shadow: 0 10px 28px rgba(52, 42, 22, 0.12);
	}

	@media (prefers-color-scheme: light) {
		:root:not([data-theme]) {
			color-scheme: light;
			--bg: #f6f2e8;
			--fg: #14201a;
			--muted: #4a564d;
			--faint: #5f6a61;
			--card: #fdfaf2;
			--card-2: #efe9dc;
			--border: #ded5c3;
			--accent: #935400;
			--accent-2: #935400;
			--accent-ink: #fffaf0;
			--accent-soft: rgba(147, 84, 0, 0.1);
			--danger: #a33a26;
			--danger-bg: rgba(163, 58, 38, 0.08);
			--shadow: 0 10px 28px rgba(52, 42, 22, 0.12);
		}
	}

	body {
		font-family: var(--sans) !important;
		background: var(--bg) !important;
		color: var(--fg) !important;
		line-height: 1.6;
		margin: 0;
		padding: 1.25rem;
		-webkit-font-smoothing: antialiased;
	}

	#container, .rnd {
		background-image: none !important;
		background: transparent !important;
		width: 100% !important;
		max-width: 1100px;
		box-shadow: none !important;
		border: none !important;
		padding: 0 !important;
		margin: 0 auto;
	}

	#printarea {
		background: var(--card) !important;
		border: 1px solid var(--border) !important;
		border-radius: 8px;
		box-shadow: var(--shadow);
		padding: 1.2rem;
	}

	.modern-title {
		margin: 0 0 0.4rem;
		color: var(--fg);
		font-family: var(--serif);
		font-size: clamp(1.5rem, 3.4vw, 2.35rem);
		font-weight: 400;
		letter-spacing: -0.01em;
		line-height: 1.05;
		text-transform: none;
	}

	.modern-subtitle {
		margin: 0 0 1rem;
		font-size: 0.95rem;
		color: var(--muted);
	}

	.modern-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.modern-chip {
		border: 1px solid var(--border);
		background: var(--card-2);
		border-radius: 4px;
		padding: 0.6rem 0.75rem;
		font-size: 0.92rem;
	}

	.modern-chip strong {
		color: var(--faint);
		font-family: var(--sans);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-right: 0.4rem;
	}

	.modern-section-title {
		margin: 1rem 0 0.5rem;
		padding-inline-start: 0.7rem;
		border-inline-start: 3px solid var(--accent);
		color: var(--fg);
		font-weight: 650;
		font-size: 0.86rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	table {
		width: 100% !important;
		border-collapse: separate !important;
		border-spacing: 0;
		margin-bottom: 1rem !important;
		background: var(--card);
		border-radius: 4px;
		overflow: hidden;
		box-shadow: none;
		border: 1px solid var(--border) !important;
	}

	th, td {
		padding: 0.6rem 0.75rem !important;
		border: none !important;
		border-bottom: 1px solid var(--border) !important;
		text-align: center !important;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}

	th {
		background: var(--card-2) !important;
		color: var(--faint) !important;
		font-weight: 600 !important;
		text-transform: uppercase;
		font-size: 0.7rem !important;
		letter-spacing: 0.1em;
	}

	tr:last-child td {
		border-bottom: none !important;
	}

	td:nth-child(2), td.style5 {
		text-align: start !important;
	}

	.modern-kpi {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin: 0.2rem 0 1rem;
	}

	.modern-kpi-card {
		border-radius: 4px;
		border: 1px solid var(--border);
		border-inline-start: 3px solid var(--accent);
		background: var(--card-2);
		padding: 0.7rem 0.85rem;
	}

	.modern-kpi-card span {
		display: block;
		font-size: 0.72rem;
		color: var(--faint);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.modern-kpi-card strong {
		display: block;
		margin-top: 0.2rem;
		color: var(--fg);
		font-size: 1.35rem;
		font-variant-numeric: tabular-nums;
	}

	.modern-remark {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.7rem 0.85rem;
		background: var(--card-2);
		margin: 0.35rem 0 0.8rem;
	}

	.modern-failed {
		border: 1px solid var(--danger);
		background: var(--danger-bg);
		border-radius: 4px;
		padding: 0.7rem 0.85rem;
	}

	.modern-failed-title {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		font-weight: 700;
		color: var(--danger);
		margin-bottom: 0.4rem;
	}

	.modern-failed ul {
		margin: 0;
		padding-left: 1rem;
	}

	.modern-failed li {
		margin: 0.12rem 0;
	}

	@media (max-width: 840px) {
		body {
			padding: 0.85rem;
		}

		#printarea {
			border-radius: 4px;
			padding: 0.78rem;
		}

		.modern-grid, .modern-kpi {
			grid-template-columns: 1fr;
		}

		th, td {
			font-size: 0.8rem;
			padding: 0.5rem 0.55rem !important;
		}
	}

	img[src*="logo"] { display: none !important; }
	#ContentPlaceHolder1_HyperLink_Back { display: none !important; }
</style>
`;

export const OFFICIAL_CSS = `
<style>
	body {color: #000;background-repeat: no-repeat;margin: 0;padding: 0;font-family: Arial,Times New Roman,Times,serif;font-size: 13px}
	img {border-style: none;border-color: inherit;border-width: medium;margin: 0;padding: 0}
	.justify {text-align: justify}
	.bold {font-weight: 700}
	.center {text-align: center}
	.right {text-align: right}
	.nostart {margin: 0;padding: 0;list-style-type: none}
	.clear:after {content: ".";clear: both;visibility: hidden;height: 0;line-height: 0;display: block}
	.clear {display: inline-block}
	html[xmlns] .clear {display: block}
	* html .clear {height: 1%}
	a {color: #55abda;outline: none;text-decoration: none}
	.fl_left {float: none;margin-left: 10px}
	.fl_right {float: right}
	.imgholder,.imgl,.imgr {text-align: center;border: 1px solid #dedacb;padding: 4px}
	.imgl {float: left;clear: left;margin: 0 15px 15px 0}
	.imgr {float: right;clear: right;margin: 0 0 15px 15px}
	div.wrapper {text-align: center;width: 960px;margin: 0 auto 5px;position: relative}
	div.wrapper h1,div.wrapper h2,div.wrapper h3,div.wrapper h4,div.wrapper h5,div.wrapper h6 {margin: 0 0 5px;padding: 0;font-size: 12px;font-style: normal;font-weight: 400;line-height: normal}
	.row1 {color: #000}
	.row1 a,.row2 {color: #000;background-color: #0000}
	.row3,.row4 {color: #000;background-color: #fff;border-radius: 10px}
	#header,#container,#footer {width: 960px;display: block}
	.rnd {background: url(../images/round_top.png) 0 0 no-repeat;width: 960px;font-size: 13px;display: block}
	#header {padding: .5% 0 0}
	#header h1,#header p,#header ul {margin: 0;padding: 0;line-height: normal;list-style: none}
	#header h1 {font-variant: small-caps;font-size: 30px;font-style: normal}
	#header .fl_right {text-align: right;width: 360px;display: block}
	#header .fl_right ul {margin-bottom: 10px;font-size: 12px}
	#header .fl_right li {border-right: 1px solid #fcfcfc;margin: 0 4px 0 0;padding: 0 6px 0 0;display: inline}
	#header .fl_right li.last {border: none;margin: 0;padding: 0}
	#container {background: url(../images/round_bot.png) 0 100% no-repeat;width: 920px;padding: 20px;line-height: 1.6em}
	#container a {color: #363539;display: block}
	#container h1,#container h2,#container h3,#container h4,#container h5,#container h6 {border-bottom: 1px solid #dedacb;padding-bottom: 8px}
	#container .readmore {text-align: right;width: 100%;line-height: normal;display: block}
	#content {float: left;width: 600px;display: block}
	#comments {margin-bottom: 40px}
	#comments .commentlist {margin: 0;padding: 0}
	#comments .commentlist ul {margin: 0;padding: 0;list-style: none}
	#comments .commentlist li.comment_odd,#comments .commentlist li.comment_even {margin: 0 0 10px;padding: 15px;list-style: none}
	#comments .commentlist li.comment_odd {color: #666;background-color: #f7f7f7}
	#comments .commentlist li.comment_odd a {color: #55abda;background-color: #f7f7f7}
	#comments .commentlist li.comment_even {color: #666;background-color: #e8e8e8}
	#comments .commentlist li.comment_even a {color: #55abda;background-color: #e8e8e8}
	#comments .commentlist .author .name {font-weight: 700}
	#comments .commentlist .submitdate {font-size: smaller}
	#comments .commentlist p {text-transform: none;margin: 10px 5px 10px 0;padding: 0;font-weight: 400}
	#comments .commentlist li .avatar {float: right;border: 1px solid #eee;margin: 0 0 0 10px}
	#column {float: right;width: 300px;display: block}
	#column .holder,#column #featured {width: 300px;margin-bottom: 30px;display: block}
	#column .holder h2.title {text-transform: none;border-bottom: 1px dotted #999;width: 100%;height: 65px;margin: 0;padding: 15px 0 0;font-size: 20px;line-height: normal;display: block}
	#column .holder h2.title img {float: left;border: 1px solid #999;margin: -15px 8px 0 0;padding: 5px}
	#column div.imgholder {width: 290px;margin: 0 0 10px;display: block}
	#column .holder p.readmore {text-align: right;width: 100%;font-weight: 700;line-height: normal;display: block}
	#column #featured ul,#column #featured h2,#column #featured p {color: #666;background-color: #f7f7f7;margin: 0;padding: 0;list-style: none}
	#column #featured a {color: #fc9039;background-color: #f7f7f7}
	#column #featured li {color: #666;background-color: #f7f7f7;width: 250px;margin: 0;padding: 20px 25px;display: block}
	#column #featured li p.imgholder{width:240px;height:90px;margin:20px 0 15px;display:block}
	#column #featured li h2{border-bottom:1px dotted #999;margin:0;padding:0 0 8px;font-family:Georgia,Times New Roman,Times,serif;font-weight:400;line-height:normal}
	#container #column .readmore a{text-align:right;background:0 0;width:100%;height:auto;margin-top:15px;padding-left:0;font-weight:700;line-height:normal;display:block}
	#column .latestnews{width:100%;margin:0;padding:0;list-style:none;display:block}
	#column .latestnews li{border-bottom:1px dotted #c7c5c8;width:100%;height:99px;margin:0 0 11px;padding:0 0 21px;display:block;overflow:hidden}
	#column .latestnews li.last,#column .last{margin-bottom:0}
	#column .latestnews p{display:inline}
	#column .latestnews img{float:left;clear:left;border:1px solid #c7c5c8;margin:0 10px 0 0;padding:4px}
	#footer{background:url(../images/round_bot.gif) 0 100% no-repeat;width:920px;padding:5px 20px 15px}
	#footer .fl_left img{margin-bottom:25px}
	#footer address{float:left;text-transform:none;margin-left:40px;font-style:normal;line-height:1.8em;display:inline}
	#footer .fl_right{width:400px;display:block}
	#footer .fl_right p{margin:0 0 15px;padding:0;line-height:normal}
	#footer .fl_right #social{width:100%;margin:0 0 15px;padding:0;line-height:normal;display:block}
	#footer .fl_right #social ul{margin:0;padding:0;list-style:none}
	#footer .fl_right #social li{float:left}
	#footer .fl_right #social a{float:left;text-indent:-4000em;background:url(../images/social-sprite.gif) no-repeat;width:49px;height:49px;margin-right:20px;display:block;overflow:hidden}
	#footer .fl_right #social li.last a{margin-right:0}
	#footer .last{margin:0}
	#copyright{padding:0 12px}
	#copyright p{margin:0;padding:0}
	#copyright,#copyright a{color:#000;background-color:#0000}
	table{border-collapse:collapse;table-layout:auto;vertical-align:top;margin-bottom:5px;margin-right:0}
	table tbody td{vertical-align:middle}
	table thead th,table tbody td{border-collapse:collapse;text-align:center;padding:5px}
	table tbody tr.light,table tbody tr.dark{color:#666;background-color:#0000}
	.style1{text-align:left;border-style:solid;border-width:1px;border-top-color:#a0a0a0;border-left-color:#a0a0a0;width:100%}
	.style5{text-align:left}
	.style6{border-style:solid;border-width:1px;border-top-color:#a0a0a0;border-left-color:#a0a0a0;width:100%}
	.style7{width:100%}
	.style9{font-size:xx-large}
	.style11{text-align:left;width:472px}
	#ContentPlaceHolder1_HyperLink_Back { display: none !important; }
</style>
`;

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function stringOrNA(value: unknown): string {
	if (typeof value === "string" && value.trim()) {
		return escapeHtml(value.trim());
	}
	if (typeof value === "number") {
		return escapeHtml(String(value));
	}
	return "NA";
}

const CARD_CSS = `
<style>
	/* The card stands alone in an iframe, so it carries its own tokens instead
	   of importing the site sheet. Same desk, same two themes. */
	@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Public+Sans:wght@400;500;600;700&display=swap');

	:root {
		--bg: #151b18;
		--surface: #1d2520;
		--paper: #e7e1d5;
		--muted: #cac4b6;
		--faint: #a5a399;
		--line: #3a4941;
		--line-strong: #4a5e51;
		--accent: #e3a049;
		--accent-hover: #f2b862;
		--accent-ink: #1a1206;
		--shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		--sans: "Public Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
		--serif: "Instrument Serif", "Iowan Old Style", "Palatino Linotype", serif;
		color-scheme: dark;
	}

	[data-theme="light"] {
		--bg: #f6f2e8;
		--surface: #fdfaf2;
		--paper: #14201a;
		--muted: #4a564d;
		--faint: #5f6a61;
		--line: #ded5c3;
		--line-strong: #c5bba6;
		--accent: #935400;
		--accent-hover: #7a4500;
		--accent-ink: #fffaf0;
		--shadow: 0 10px 28px rgba(52, 42, 22, 0.12);
		color-scheme: light;
	}

	@media (prefers-color-scheme: light) {
		:root:not([data-theme]) {
			--bg: #f6f2e8;
			--surface: #fdfaf2;
			--paper: #14201a;
			--muted: #4a564d;
			--faint: #5f6a61;
			--line: #ded5c3;
			--line-strong: #c5bba6;
			--accent: #935400;
			--accent-hover: #7a4500;
			--accent-ink: #fffaf0;
			--shadow: 0 10px 28px rgba(52, 42, 22, 0.12);
			color-scheme: light;
		}
	}

	body {
		margin: 0;
		min-height: 100vh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: clamp(1rem, 4vw, 2.5rem) clamp(0.75rem, 3vw, 1.5rem);
		background: var(--bg);
		color: var(--paper);
		font-family: var(--sans);
		-webkit-font-smoothing: antialiased;
		/* This document is embedded at 90dvh inside the result page, so it is
		   always its own scroll context. Stop its ends from dragging the page
		   behind it. */
		overscroll-behavior: contain;
	}

	.result-card {
		width: 100%;
		max-width: 32rem;
		padding: clamp(1.25rem, 4vw, 1.85rem);
		border: 1px solid var(--line);
		border-top: 3px solid var(--accent);
		border-radius: 4px;
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.result-card h1 {
		margin: 0 0 0.5rem;
		font-family: var(--serif);
		font-size: clamp(1.4rem, 5vw, 1.7rem);
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -0.01em;
		color: var(--paper);
	}

	.result-card p {
		margin: 0;
		max-width: 44ch;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.result-card-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1.5rem;
	}

	.result-card-actions .action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.65rem 1rem;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: transparent;
		color: var(--paper);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.1;
		text-align: center;
		text-decoration: none;
		transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.result-card-actions .action:hover {
			border-color: var(--paper);
		}

		.result-card-actions .action-primary:hover {
			border-color: var(--accent-hover);
			background: var(--accent-hover);
			color: var(--accent-ink);
		}

		.result-card-actions .action-quiet:hover {
			border-color: transparent;
			color: var(--paper);
		}
	}

	.result-card-actions .action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.result-card-actions .action-primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.result-card-actions .action-quiet {
		border-color: transparent;
		color: var(--faint);
		font-weight: 500;
		padding-inline: 0.5rem;
	}

	.result-card-actions button.action {
		cursor: pointer;
	}

	.captcha-number {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.15rem 0.55rem;
		margin: 1.15rem 0 0;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg);
	}

	.captcha-number span {
		color: var(--faint);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.captcha-number code {
		color: var(--paper);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		font-variant-numeric: tabular-nums;
	}

	.captcha-note {
		margin: 0.6rem 0 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--faint);
	}

	.captcha-note[data-copied="true"] {
		color: var(--accent);
	}
</style>
`;

type CardAction = {
	label: string;
	href?: string;
	variant?: "primary" | "quiet";
	external?: boolean;
	/** Written to the clipboard by the captcha card's inline script. */
	copy?: string;
	id?: string;
};

function renderCardActions(actions: CardAction[]): string {
	if (actions.length === 0) return "";
	const items = actions
		.map((action) => {
			const classes = [
				"action",
				action.variant === "primary" ? "action-primary" : "",
				action.variant === "quiet" ? "action-quiet" : "",
			]
				.filter(Boolean)
				.join(" ");
			const id = action.id ? ` id="${escapeHtml(action.id)}"` : "";
			const copy = action.copy ? ` data-copy="${escapeHtml(action.copy)}"` : "";
			if (action.href) {
				const external = action.external ? ' target="_blank" rel="noopener"' : "";
				return `<a class="${classes}" href="${escapeHtml(action.href)}"${id}${copy}${external}>${escapeHtml(action.label)}</a>`;
			}
			return `<button type="button" class="${classes}"${id}${copy}>${escapeHtml(action.label)}</button>`;
		})
		.join("\n");
	return `<div class="result-card-actions">${items}</div>`;
}

/** A card carries the site theme it was opened under. Omitted means "follow
 * the reader's system", which is what a shared link should do. */
export type CardTheme = "light" | "dark";

type CardExtras = {
	/** Content between the error sentence and the actions. */
	details?: string;
	/** Inline behaviour for the card; runs after its markup exists. */
	script?: string;
	/** What the card is: a dead end, or the way to the result BEU keeps behind
	 * its captcha. `result.astro` reads it so a handoff is never counted as a
	 * failure. */
	kind?: "error" | "handoff";
	/** Why the handoff is the answer. Only meaningful with `kind: "handoff"`. */
	reason?: "matched" | "not_published" | "unavailable";
};

/** Standalone card document. It carries CARD_CSS alone — the result stylesheet
 * is for BEU's own markup and would only fight it.
 *
 * `result.astro` reads the text of `.error-card` inside the frame to set the
 * page status, so that class marks the heading and sentence alone — never the
 * actions. */
function buildCardHTML(
	title: string,
	body: string,
	actions: CardAction[] = [],
	theme?: CardTheme,
	extras: CardExtras = {},
): string {
	const themeAttr = theme ? ` data-theme="${theme}"` : "";
	const kindAttr = ` data-card-kind="${extras.kind ?? "error"}"`;
	const reasonAttr = extras.reason ? ` data-card-reason="${extras.reason}"` : "";
	return `<!doctype html>
<html lang="en"${themeAttr}>
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="color-scheme" content="${theme ?? "light dark"}" />
	<title>${escapeHtml(title)}</title>
	${CARD_CSS}
</head>
<body>
	<div class="result-card"${kindAttr}${reasonAttr}>
		<div class="error-card">
			<h1>${escapeHtml(title)}</h1>
			<p>${escapeHtml(body)}</p>
		</div>
		${extras.details ?? ""}
		${renderCardActions(actions)}
		${extras.script ?? ""}
	</div>
</body>
</html>`;
}

export function buildErrorHTML(
	title: string,
	message: string,
	options: { retryHref?: string; theme?: CardTheme } = {},
): string {
	return buildCardHTML(
		title,
		message,
		options.retryHref
			? [{ href: options.retryHref, label: "Try again", variant: "quiet" }]
			: [],
		options.theme,
	);
}

const CAPTCHA_COPY_SCRIPT = `<script>
	(function () {
		var note = document.getElementById("captchaNote");
		function legacyCopy(value) {
			var area = document.createElement("textarea");
			area.value = value;
			area.setAttribute("readonly", "");
			area.style.position = "fixed";
			area.style.top = "0";
			area.style.opacity = "0";
			document.body.appendChild(area);
			area.select();
			var ok = false;
			try { ok = document.execCommand("copy"); } catch (error) {}
			document.body.removeChild(area);
			return ok;
		}
		function copy(value) {
			var ok = legacyCopy(value);
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(value).catch(function () {});
			}
			return ok;
		}
		function say(text) {
			if (!note) return;
			note.textContent = text;
			note.setAttribute("data-copied", "true");
		}
		var targets = document.querySelectorAll("[data-copy]");
		for (var index = 0; index < targets.length; index += 1) {
			targets[index].addEventListener("click", function () {
				var value = this.getAttribute("data-copy") || "";
				if (!value) return;
				var ok = copy(value);
				say(ok ? "Number copied. Paste it on BEU." : "Select the number above and copy it.");
			});
		}
	})();
</script>`;

export type CaptchaOptions = {
	retryHref?: string;
	theme?: CardTheme;
	/** The exact `/result-two/:exam?d=…` link. */
	officialUrl?: string;
	/** The published exam's own name, e.g. "B.Tech. 4th Semester Examination, 2025". */
	examName?: string | null;
	registrationNo?: string;
	semester?: number;
	/** Why `officialUrl` is what it is. Defaults to "matched" when an exam name
	 * was given, so an unlabelled link is never described as published. */
	status?: OfficialExamStatus;
};

/** The portal cannot be read without a human solving its challenge. The card
 * opens the semester's own exam directly — never a list to pick from — and
 * carries the number: it is copied on the way out so only a paste is left. */
export function buildCaptchaHTML(options: CaptchaOptions = {}): string {
	const semester = options.semester;
	const semesterLabel = semester ? `semester ${semester}` : "your semester";
	const examName = options.examName?.trim() || "";
	const status: OfficialExamStatus =
		options.status ?? (examName ? "matched" : "not_published");
	const number = (options.registrationNo ?? "").replace(/[^0-9A-Za-z]/g, "");

	const title =
		status === "matched"
			? "Your result is on BEU"
			: status === "not_published"
				? "This result is not out yet"
				: "BEU did not answer";

	const body =
		status === "matched"
			? number
				? `BEU asks for a captcha before it shows the marks. Your number is copied when you tap.`
				: `BEU asks for a captcha before it shows the marks.`
			: status === "not_published"
				? `BEU has not published the ${semesterLabel} exam for your batch yet.`
				: `BEU's exam list did not answer, so the ${semesterLabel} exam could not be opened.`;

	const actions: CardAction[] = [];
	if (status === "matched") {
		actions.push({
			href: options.officialUrl ?? OFFICIAL_PORTAL_URL,
			label: `Open ${semesterLabel} exam`,
			variant: "primary",
			external: true,
			copy: number || undefined,
			id: "captchaOpen",
		});
		if (number) {
			actions.push({ label: "Copy number", copy: number, id: "captchaCopy" });
		}
	} else if (status === "unavailable") {
		// The list is the only thing that could not be reached, so it stays
		// reachable by hand; a published exam would never land here.
		actions.push({
			href: options.officialUrl ?? OFFICIAL_PORTAL_URL,
			label: "Open BEU",
			variant: "primary",
			external: true,
		});
	}
	if (options.retryHref) {
		actions.push({ href: options.retryHref, label: "Try again", variant: "quiet" });
	}

	const showNumber = status === "matched" && number.length > 0;
	const details = showNumber
		? `<p class="captcha-number"><span>Registration number</span><code>${escapeHtml(number)}</code></p>
		<p class="captcha-note" id="captchaNote" role="status" aria-live="polite">Copied when you open BEU — paste it in their box.</p>`
		: "";

	return buildCardHTML(title, body, actions, options.theme, {
		details,
		script: showNumber ? CAPTCHA_COPY_SCRIPT : "",
		kind: "handoff",
		reason: status,
	});
}

export function getSemOrdinal(semester: number): string {
	if (semester === 1) return "1st";
	if (semester === 2) return "2nd";
	if (semester === 3) return "3rd";
	return `${semester}th`;
}

export function renderSubjectRows(
	subjects: SubjectRow[] | undefined,
	rowIdPrefix: string,
): string {
	if (!Array.isArray(subjects) || subjects.length === 0) {
		return `<tr class="light"><td colspan="7"><span id="${escapeHtml(`${rowIdPrefix}_NoRecord_0`)}">No Record Found</span></td></tr>`;
	}

	return subjects
		.map(
			(subject, index) => `
			<tr align="left" class="${index % 2 === 0 ? "light" : "dark"}">
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_CodeLabel_${index}`)}">${stringOrNA(subject.code)}</span></td>
				<td align="left"><span id="${escapeHtml(`${rowIdPrefix}_PaperNameLabel_${index}`)}">${stringOrNA(subject.name)}</span></td>
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_EseLabel_${index}`)}">${stringOrNA(subject.ese)}</span></td>
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_IaLabel_${index}`)}">${stringOrNA(subject.ia)}</span></td>
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_TotalLabel_${index}`)}">${stringOrNA(subject.total)}</span></td>
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_GradeLabel_${index}`)}" style="font-weight:700;">${stringOrNA(subject.grade)}</span></td>
				<td align="center"><span id="${escapeHtml(`${rowIdPrefix}_CreditLabel_${index}`)}">${stringOrNA(subject.credit)}</span></td>
			</tr>`,
		)
		.join("");
}

export function renderSgpaCells(sgpa: Array<string | null> | undefined): string {
	const values = Array.isArray(sgpa) ? sgpa : [];
	return Array.from({ length: 8 }, (_, index) => {
		const value = values[index];
		return `<td>${stringOrNA(value)}</td>`;
	}).join("");
}

export function injectCssIntoHtmlDocument(
	html: string,
	css: string,
	theme?: "light" | "dark",
): string {
	const themeScript = theme
		? `<script>document.documentElement.setAttribute("data-theme","${theme}")</script>`
		: "";
	if (/<\/head>/i.test(html)) {
		return html.replace(/<\/head>/i, `${themeScript}${css}</head>`);
	}
	if (/<html/i.test(html)) {
		const themed = theme
			? html.replace(/<html([^>]*)>/i, (_match, attrs: string) =>
					/data-theme=/i.test(attrs) ? `<html${attrs}>` : `<html${attrs} data-theme="${theme}">`,
				)
			: html;
		return `${themed}${themeScript}${css}`;
	}
	return `${themeScript}${css}<div class="rnd">${html}</div>`;
}

export function buildOfficialLegacyDocument(
	html: string,
	bodyMarkup: string,
	legacyTarget: string,
	appBasePath: string,
): string {
	const baseUrl = getLegacyDocumentBase(legacyTarget);
	const isAkuSource = /akuexam\.(?:net|com)/i.test(legacyTarget);
	const watermarkPath = isAkuSource
		? `${appBasePath}images/akulogowatermark.png`
		: `${appBasePath}images/logowatermark.png`;
	let normalizedBody = absolutizeAssetUrls(bodyMarkup, baseUrl);
	normalizedBody = normalizedBody.replace(
		/(["'(])(?:https?:\/\/[^"')]+\/)?images\/logowatermark\.png(["')])/gi,
		`$1${watermarkPath}$2`,
	);
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<base href="${escapeHtml(baseUrl)}" />
	<link rel="stylesheet" href="${escapeHtml(`${appBasePath}layout.css`)}" />
</head>
<body>
${normalizedBody}
</body>
</html>`;
}

export function renderJsonResultHtml(
	data: ResultPayload,
	semester: number,
	viewMode: ViewMode,
	appBasePath: string,
): string {
	const theoryRows = renderSubjectRows(
		data.theorySubjects,
		"ContentPlaceHolder1_GridView1",
	);
	const practicalRows = renderSubjectRows(
		data.practicalSubjects,
		"ContentPlaceHolder1_GridView2",
	);
	const semLabel = getSemOrdinal(semester);
	const semSgpa = Array.isArray(data.sgpa) ? data.sgpa[semester - 1] : null;
	const failedSubjects = normalizeFailedSubjects(data);
	if (viewMode === "modern") {
		const content = `${MODERN_CSS}
		<div class="rnd">
			<div id="printarea">
				<div id="container" class="clear">
					<h1 class="modern-title">Bihar Engineering University, Patna</h1>
					<p class="modern-subtitle">B.Tech. ${escapeHtml(semLabel)} Semester Examination, ${stringOrNA(data.examYear)}</p>
					<div class="modern-grid">
						<div class="modern-chip"><strong>Semester:</strong> ${stringOrNA(data.semester)}</div>
						<div class="modern-chip"><strong>Examination Held:</strong> ${stringOrNA(data.exam_held)}</div>
						<div class="modern-chip"><strong>Registration No:</strong> ${stringOrNA(data.redg_no)}</div>
						<div class="modern-chip"><strong>Student Name:</strong> ${stringOrNA(data.name)}</div>
						<div class="modern-chip"><strong>Father Name:</strong> ${stringOrNA(data.father_name)}</div>
						<div class="modern-chip"><strong>Mother Name:</strong> ${stringOrNA(data.mother_name)}</div>
						<div class="modern-chip"><strong>College Name:</strong> ${stringOrNA(data.college_code)} - ${stringOrNA(data.college_name)}</div>
						<div class="modern-chip"><strong>Course Name:</strong> ${stringOrNA(data.course_code)} - ${stringOrNA(data.course)}</div>
					</div>
					<div class="modern-kpi">
						<div class="modern-kpi-card"><span>Current Semester SGPA</span><strong>${stringOrNA(semSgpa)}</strong></div>
						<div class="modern-kpi-card"><span>Cumulative CGPA</span><strong>${stringOrNA(data.cgpa)}</strong></div>
					</div>
					<h2 class="modern-section-title">Theory Subjects</h2>
					<table cellspacing="0" rules="all" border="1" id="ContentPlaceHolder1_GridView1">
						<tr align="center"><th scope="col">Code</th><th scope="col">Subject Name</th><th scope="col">ESE</th><th scope="col">IA</th><th scope="col">Total</th><th scope="col">Grade</th><th scope="col">Credit</th></tr>
						${theoryRows}
					</table>
					<h2 class="modern-section-title">Practical Subjects</h2>
					<table cellspacing="0" rules="all" border="1" id="ContentPlaceHolder1_GridView2">
						<tr align="center"><th scope="col">Code</th><th scope="col">Subject Name</th><th scope="col">ESE</th><th scope="col">IA</th><th scope="col">Total</th><th scope="col">Grade</th><th scope="col">Credit</th></tr>
						${practicalRows}
					</table>
					<h2 class="modern-section-title">Semester-wise SGPA and CGPA</h2>
					<table cellspacing="0" rules="all" border="1" width="100%" id="ContentPlaceHolder1_GridView3">
						<tr align="center"><th>I</th><th>II</th><th>III</th><th>IV</th><th>V</th><th>VI</th><th>VII</th><th>VIII</th><th>Cur. CGPA</th></tr>
						<tr align="center">${renderSgpaCells(data.sgpa)}<td><span id="ContentPlaceHolder1_GridView3_CurCgpaLabel_0" style="font-weight:700;">${stringOrNA(data.cgpa)}</span></td></tr>
					</table>
					<h2 class="modern-section-title">Remarks</h2>
					<div class="modern-remark"><span id="ContentPlaceHolder1_DataList7_RemarksLabel_0">${stringOrNA(data.fail_any || "PASS")}</span></div>
					${
						failedSubjects.length > 0
							? `<div class="modern-failed"><div class="modern-failed-title">Failed Subjects</div><ul>${failedSubjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join("")}</ul></div>`
							: ""
					}
				</div>
			</div>
		</div>`;
		return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
${content}
</body>
</html>`;
	}

	const content = `<div class="rnd">
		<div id="printarea" style="font-family:Tahoma; font-size:14px">
			<div id="container" class="clear" style="background-image: url('${escapeHtml(`${appBasePath}images/logowatermark.png`)}'); background-repeat: no-repeat; background-position: center center">
				<table class="style7" id="ContentPlaceHolder1_DataList0" cellspacing="0" border="0">
					<tr><td><p style="text-transform:uppercase;text-align:center;font-weight:800;" class="style9"><span id="ContentPlaceHolder1_lblUniversityName">Bihar Engineering University, Patna</span></p></td></tr>
					<tr><td style="text-align:center"><span id="ContentPlaceHolder1_lblExamName">B.Tech. ${escapeHtml(semLabel)} Semester Examination, ${stringOrNA(data.examYear)}</span></td></tr>
				</table>

				<table width="100%" id="ContentPlaceHolder1_DataList2" cellspacing="0" border="0"><tr><td>
					<table class="style1" border="1" id="ContentPlaceHolder1_DataList2_ItemTable_0">
						<tr>
							<td class="style11"><strong>Semester:</strong> <span id="ContentPlaceHolder1_DataList2_SemesterLabel_0">${stringOrNA(data.semester)}</span></td>
							<td class="style5"><strong>Examination Held:</strong> <span id="ContentPlaceHolder1_DataList2_ExamHeldLabel_0">${stringOrNA(data.exam_held)}</span></td>
						</tr>
					</table>
				</td></tr></table>

				<table width="100%" id="ContentPlaceHolder1_DataList1" cellspacing="0" border="0"><tr><td>
					<table class="style1" border="1" id="ContentPlaceHolder1_DataList1_ItemTable_0">
						<tr><td class="style5"><strong>Registration No:</strong></td><td class="style5" colspan="3"><span id="ContentPlaceHolder1_DataList1_RegistrationNoLabel_0">${stringOrNA(data.redg_no)}</span></td></tr>
						<tr><td class="style5"><strong>Student Name:</strong></td><td colspan="3" class="style5"><span id="ContentPlaceHolder1_DataList1_StudentNameLabel_0">${stringOrNA(data.name)}</span></td></tr>
						<tr>
							<td class="style5"><strong>Father Name:</strong></td><td class="style5"><span id="ContentPlaceHolder1_DataList1_FatherNameLabel_0">${stringOrNA(data.father_name)}</span></td>
							<td class="style5"><strong>Mother Name:</strong></td><td class="style5"><span id="ContentPlaceHolder1_DataList1_MotherNameLabel_0">${stringOrNA(data.mother_name)}</span></td>
						</tr>
						<tr><td class="style5"><strong>College Name:</strong></td><td colspan="3" class="style5"><span id="ContentPlaceHolder1_DataList1_CollegeNameLabel_0">${stringOrNA(data.college_code)} - ${stringOrNA(data.college_name)}</span></td></tr>
						<tr><td class="style5"><strong>Course Name:</strong></td><td colspan="3" class="style5"><span id="ContentPlaceHolder1_DataList1_CourseNameLabel_0">${stringOrNA(data.course_code)} - ${stringOrNA(data.course)}</span></td></tr>
					</table>
				</td></tr></table>

				<table cellspacing="0" rules="all" border="1" id="ContentPlaceHolder1_GridView1" style="width:100%;">
					<tr align="center"><th scope="col">Code</th><th scope="col">Subject Name</th><th scope="col">ESE</th><th scope="col">IA</th><th scope="col">Total</th><th scope="col">Grade</th><th scope="col">Credit</th></tr>
					${theoryRows}
				</table>

				<table cellspacing="0" rules="all" border="1" id="ContentPlaceHolder1_GridView2" style="width:100%;">
					<tr align="center"><th scope="col">Code</th><th scope="col">Subject Name</th><th scope="col">ESE</th><th scope="col">IA</th><th scope="col">Total</th><th scope="col">Grade</th><th scope="col">Credit</th></tr>
					${practicalRows}
				</table>

				<table id="ContentPlaceHolder1_DataList5" cellspacing="0" border="0" style="width:100%;">
					<tr><td><table class="style6" id="ContentPlaceHolder1_DataList5_ItemTable_0"><tr><td width="50%" style="text-align:center"><strong>SGPA:</strong> <span id="ContentPlaceHolder1_DataList5_GROSSTHEORYTOTALLabel_0">${stringOrNA(semSgpa)}</span></td></tr></table></td></tr>
				</table>

				<table border="1" style="width:100%;" id="ContentPlaceHolder1_CGPAWrapper">
					<tr><td width="10%"><table border="1"><tr><td><strong>Sem:</strong></td></tr><tr><td><strong>SGPA:</strong></td></tr></table></td><td>
						<table cellspacing="0" rules="all" border="1" width="100%" id="ContentPlaceHolder1_GridView3">
							<tr align="center"><th>I</th><th>II</th><th>III</th><th>IV</th><th>V</th><th>VI</th><th>VII</th><th>VIII</th><th>Cur. CGPA</th></tr>
							<tr align="center">${renderSgpaCells(data.sgpa)}<td><span id="ContentPlaceHolder1_GridView3_CurCgpaLabel_0" style="font-weight:700;">${stringOrNA(data.cgpa)}</span></td></tr>
						</table>
					</td></tr>
				</table>

				<table cellspacing="0" width="100%" id="ContentPlaceHolder1_DataList7"><tr><td><table class="style6" border="1" id="ContentPlaceHolder1_DataList7_ItemTable_0">
					<tr><td width="50%" style="text-align:left"><strong>Remarks:</strong> <span id="ContentPlaceHolder1_DataList7_RemarksLabel_0">${stringOrNA(data.fail_any || "PASS")}</span></td></tr>
				</table></td></tr></table>
			</div>
		</div>
	</div>`;

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link rel="stylesheet" href="${escapeHtml(`${appBasePath}layout.css`)}" />
</head>
<body>
${content}
</body>
</html>`;
}
