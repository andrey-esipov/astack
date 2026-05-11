# astack — Andrey's personal fork of gstack

This is a personal fork of [garrytan/gstack](https://github.com/garrytan/gstack)
maintained at [andrey-esipov/astack](https://github.com/andrey-esipov/astack).

Upstream is followed closely. This file documents the divergences and the
sync workflow.

## Customizations

These are the substantive divergences from upstream `garrytan/gstack`:

### 1. `/copilot` (new skill) + `/codex` (delegate shim)

- **`copilot/`** — wraps GitHub Copilot CLI for adversarial second-opinion
  reviews. Three modes: review (diff + gate), challenge (adversarial), consult
  (Q&A with session continuity). The differentiator: reads
  `~/.copilot/settings.json` for your default Copilot model and forces the
  **opposite family** at `xhigh` reasoning effort.
  - default `gpt-*`    → adversarial `claude-opus-4.7`
  - default `claude-*` → adversarial `gpt-5.5`
  - Override globally with `ASTACK_ADVERSARIAL_MODEL=<model>`
  - Override per-call with `-m <model>` on the slash command
- **`codex/`** — replaced upstream's OpenAI Codex CLI wrapper with a thin
  shim that delegates to `/copilot`. Preserves muscle memory and cross-skill
  callers (autoplan, plan-ceo-review, etc.) that hardcode `/codex`.

Why: this machine has Copilot CLI but no `codex` binary, and adversarial
review should default to a different family than the model the user is
running interactively.

### 2. Azure GPT-image-2 backend for design skills

`design/src/backend.ts` (new) — abstraction that lets `/design-shotgun`,
`/design-consultation`, `/design-html` route image generation through Azure
OpenAI (`gpt-image-2` deployment) instead of `api.openai.com`. Config
resolution (highest wins):

1. Env vars: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
   `AZURE_OPENAI_IMAGE_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`,
   `OPENAI_API_KEY`
2. `~/.gstack/openai.json` (see backend.ts header for schema)

Call sites in `design/src/{generate,evolve,iterate,variants}.ts` and
`{check,cli,design-to-code,diff,memory}.ts` are rewired to use
`generateImage(config, …)` / `getChatBackend(config)` instead of raw fetch.

### 3. `office-hours` — YC pitch removed

The closing beats of `office-hours/SKILL.md` that pitch Y Combinator
applications are stripped. (Upstream is Garry's personal recruiting funnel
for YC — irrelevant here.)

## Upstream-sync workflow

`origin` points to `andrey-esipov/astack`; `upstream` points to
`garrytan/gstack`. To pull upstream changes:

```bash
cd ~/.claude/skills/gstack
git fetch upstream
git merge upstream/main          # or: git rebase upstream/main
# resolve conflicts in the customized files (see "Customizations" above)
git push origin main
```

Expected conflict sites on upstream sync:

| File / area                     | Why it conflicts                          |
| ------------------------------- | ----------------------------------------- |
| `codex/SKILL.md.tmpl`           | Upstream evolves the codex skill; we have a 67-line delegate |
| `design/src/{generate,evolve,iterate,variants,check,cli,...}.ts` | Upstream tweaks OpenAI plumbing; we route through `backend.ts` |
| `office-hours/SKILL.md.tmpl`    | Upstream may evolve the closing beats; we deleted them |

`copilot/` never conflicts (no upstream equivalent). `design/src/backend.ts`
never conflicts. `bunfig.toml` never conflicts.

After resolving, regenerate compiled skill docs:

```bash
bun run gen:skill-docs
```

Then `git add -u`, commit, and push.

## `/gstack-upgrade` interaction

`/gstack-upgrade` does `git stash && git fetch origin && git reset --hard
origin/main`. Because `origin` is the fork, this hard-resets local to the
fork's tip — preserving customizations. **Do not run `/gstack-upgrade` if
you want to pull upstream changes** — it would just reset to whatever the
fork's `origin/main` already is.

The two flows are distinct:

- **Sync from upstream** → use the manual `git fetch upstream && git merge
  upstream/main && git push origin main` flow above (run from your dev box).
- **Apply already-merged changes locally** → run `/gstack-upgrade` after the
  fork's `main` has been advanced.

## Install / quick start

Use upstream's [README.md](README.md). The fork is install-compatible — same
`./setup` script, same install paths.
