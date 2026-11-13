import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/worker/index" with { type: "cf-worker" };

/**
 * The deploy config `cf build` reads.
 *
 * `entrypoint` is the app's worker, not the adapter's server, because the
 * notice pipeline needs a `scheduled` export beside `fetch`; the adapter's
 * server module has no cron handler to extend. The module is imported with the
 * same `cf-worker` attribute the adapter's own entrypoint used, so `cf` sees a
 * worker module rather than a plain ES module.
 *
 * `wrangler.jsonc` was removed deliberately: `cf` reads this file, and two
 * configs would let the cron trigger and the bindings drift apart.
 *
 * Run `cf` from this repository with `BUN_COMPAT=off`: the CLI refuses to load a
 * `.ts` config under Bun. The build has the same constraint.
 */
export default defineConfig({
	worker: {
		name: "beuconnectaw",
		compatibilityDate: "2026-09-30",
		compatibilityFlags: ["global_fetch_strictly_public"],
		entrypoint,
		env: {
			ASSETS: bindings.assets(),
			DB: bindings.d1({
				name: "beu-notifications",
				id: "c0a6953e-1fec-4c75-8a58-4ac0a80e9057",
			}),
		},
		triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
		observability: {
			enabled: true,
		},
	},
});
