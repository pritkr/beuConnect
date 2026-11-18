type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
	interface Locals extends Runtime {}
}

declare global {
	interface Window {
		/** The tracker's one entry point for inlined `define:vars` scripts. */
		beuTrack?: (
			name: string,
			params?: Record<string, string | number | boolean | null | undefined>,
		) => void;
		gtag?: (...args: unknown[]) => void;
		dataLayer?: unknown[];
	}
}

export {};
