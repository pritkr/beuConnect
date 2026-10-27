// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

import sitemap from "@astrojs/sitemap";

const excludedSitemapPatterns = [
	/^\/syllabus\/[^/]+\/\d+\/x\/?$/,
];

const customSitemapPages = [
	"https://beu.prit.eu.org/rank/",
	"https://beu.prit.eu.org/notices/",
	"https://beu.prit.eu.org/listofstudents/gecs/",
	"https://beu.prit.eu.org/listofstudents/gecscv/",
];

export default defineConfig({
  site: "https://beu.prit.eu.org",
  output: "static",
  prefetch: {
    prefetchAll: true,
  },
	vite: {
		build: { minify: "esbuild", cssMinify: "lightningcss", cssTarget: "es2023" },
	},
	integrations: [
		sitemap({
			customPages: customSitemapPages,
			filter: (page) => {
				const { pathname } = new URL(page);
				return !excludedSitemapPatterns.some((pattern) => pattern.test(pathname));
			},
		}),
	],
	adapter: cloudflare({ imageService: "compile" }),
});
