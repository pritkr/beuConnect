---
name: beuconnect
description: "BEUConnect project context: the Astro/Cloudflare site at beu.prit.eu.org and the NativeShell app in native/. Use when working in the beuconnectaw repo, planning or building the native app, or wiring site data into it."
---

# BEUConnect (compatibility entry)

The canonical, maintained skill is:

```
.opencode/skills/beuconnect/SKILL.md
```

Read that file before acting. The repo-wide map and non-negotiables are in
`AGENTS.md` at the repo root; the native app's entry is `native/AGENTS.md`.

In short:

- Web: `bun dev` / `bun run build` / `bun run deploy`, `bun check`, `bun test`.
- Native: `source ~/.config/nsh/env.sh`, `nsh run App.tsx`,
  `./scripts/check.sh test`, `./scripts/package-android.sh`.
- Never call `nsh check` / `nsh test` directly.
- Never clone over the repo, `git reset --hard`, `git clean -fd`, or hand-edit a
  generated file. Never invent a paper, result, notice, date or rank.
