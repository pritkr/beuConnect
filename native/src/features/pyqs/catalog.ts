/**
 * The PYQ catalogue as the app sees it: the bundled snapshot, unless a newer
 * one has been applied from the live feed.
 *
 * The pure helpers live in `catalog-core.ts`, which always reads the bundled
 * `RAW`. This file only chooses the snapshot and binds the feed once at module
 * load, because the feed reaches the network through `nsh`. Keeping that import
 * out of the core is what lets `scripts/audit-catalog.ts` run under plain
 * `bun` and lets the unit suite read `decode(RAW)` directly.
 */

import { dataVersion, liveCatalogRaw } from "../data-feed/pyqs";
import { RAW } from "./catalog-data";
import { bindCatalogFeed } from "./catalog-core";

export * from "./catalog-core";

bindCatalogFeed(() => ({
  version: dataVersion(),
  raw: liveCatalogRaw() ?? RAW,
}));
