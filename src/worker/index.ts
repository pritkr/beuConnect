/**
 * The deployed worker.
 *
 * Astro's Cloudflare adapter exports only `fetch`. A Cron Trigger needs a
 * `scheduled` export on the same module, so this file is the entrypoint named
 * in `cloudflare.config.ts` and it delegates `fetch` to the adapter unchanged.
 *
 * If the adapter ever ships its own `scheduled`, delete this file and point
 * `main` back at `@astrojs/cloudflare/entrypoints/server`.
 */

import server from "@astrojs/cloudflare/entrypoints/server";
import { type NotifyEnv, runTick } from "../notifications/run";

type ScheduledController = { scheduledTime: number; cron: string };
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

export default {
	fetch: server.fetch,
	async scheduled(
		controller: ScheduledController,
		env: NotifyEnv,
		_context: ExecutionContext,
	): Promise<void> {
		const summary = await runTick(env, controller.scheduledTime || Date.now());
		// One line per tick in `cf workers tail`; a tick that inserted nothing is
		// the normal case and should be cheap to read.
		console.log("notifications:tick", JSON.stringify(summary));
	},
};
