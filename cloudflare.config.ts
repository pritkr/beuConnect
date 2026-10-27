import { defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars.example, .env.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "beuconnectaw",
		compatibilityDate: "2026-10-01",
	},
});
