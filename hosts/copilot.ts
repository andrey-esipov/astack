import type { HostConfig } from '../scripts/host-config';

/**
 * GitHub Copilot CLI host.
 *
 * Copilot CLI exposes two customization surfaces:
 *   1. Skills (SKILL.md files invoked as /<name> slash commands by the user)
 *   2. Agents (.agent.md files invoked as tools by the model)
 *
 * gstack content is overwhelmingly "skills" in Copilot's sense — workflows
 * a user invokes (/qa, /review, /ship, /autoplan, …). This host emits SKILL.md
 * files via the standard per-skill-dir layout. Setup installs them under a
 * collection subdir at ~/.copilot/skills/astack/<name>/SKILL.md (or
 * ~/.copilot/skills/gstack/<name>/SKILL.md in upstream), which Copilot CLI's
 * native skill loader discovers via recursive scan.
 *
 * Schema reference:
 *   https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
 */
const copilot: HostConfig = {
  name: 'copilot',
  displayName: 'GitHub Copilot CLI',
  cliCommand: 'copilot',

  // Copilot CLI's `/skills` registry and `/` autocomplete only see flat
  // top-level entries under ~/.copilot/skills/ — collection subdirs work for
  // description-based auto-trigger but stay invisible to the picker. Install
  // is FLAT: ~/.copilot/skills/<name>/SKILL.md, with the setup script
  // renaming any skills that collide with Copilot built-ins (e.g. /review)
  // to /astack-<name>.
  globalRoot: '.copilot/skills',
  localSkillRoot: '.copilot/skills',
  hostSubdir: '.copilot',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'truncate',
  },

  generation: {
    generateMetadata: false,
    // Skipped because they don't translate to Copilot CLI's per-invocation
    // skill model (each /<name> invocation is stateless), or because they
    // wrap a CLI binary that has no reason to recurse:
    //   'codex'       — wraps the `codex` CLI binary (every external host skips this)
    //   'copilot'     — astack only: would recurse into the copilot CLI itself
    //   'freeze'      — toggles a session-scoped edit boundary; no session state to toggle
    //   'unfreeze'    — pairs with /freeze; same reason
    //   'careful'     — installs session-scoped destructive-command guardrails
    //   'guard'       — combines /careful + /freeze; same reason
    //   'plan-tune'   — interactive UI for tuning AskUserQuestion sensitivity
    //                   per-skill; only meaningful inside a persistent skill system
    // Follow-up: the rules from freeze/careful/guard could be injected into
    // a project AGENTS.md so they're ambient across every Copilot CLI session.
    skipSkills: ['codex', 'copilot', 'freeze', 'unfreeze', 'careful', 'guard', 'plan-tune'],
  },

  pathRewrites: [
    // Bash blocks inside skills reference ~/.claude/skills/gstack/bin/… for
    // sidecar tooling (telemetry, learnings, gbrain). Route them to the
    // copilot-side runtime root that setup creates at ~/.copilot/gstack/.
    // `.claude/skills` references in prose point at the same root since
    // Copilot CLI doesn't have a per-workspace skills directory equivalent
    // to .claude/skills/gstack/.
    { from: '~/.claude/skills/gstack', to: '$GSTACK_ROOT' },
    { from: '.claude/skills/gstack', to: '$GSTACK_ROOT' },
    { from: '.claude/skills', to: '$GSTACK_ROOT' },
  ],

  toolRewrites: {
    // Copilot CLI's interactive prompt tool is `ask_user`, not `AskUserQuestion`.
    // The dedicated AskUserQuestion preamble section is host-aware (see
    // scripts/resolvers/preamble/generate-ask-user-format.ts), so the tool
    // contract there is correct. These rewrites catch the inline references
    // throughout the rest of every SKILL.md body so prose like "use
    // AskUserQuestion to confirm" becomes "use ask_user to confirm".
    'AskUserQuestion': 'ask_user',
    'AUQ': 'ask_user',
  },

  suppressedResolvers: [
    'DESIGN_OUTSIDE_VOICES',
    'ADVERSARIAL_STEP',
    'CODEX_SECOND_OPINION',
    'CODEX_PLAN_REVIEW',
    'REVIEW_ARMY',
    'GBRAIN_CONTEXT_LOAD',
    'GBRAIN_SAVE_RESULTS',
  ],

  runtimeRoot: {
    globalSymlinks: ['bin', 'browse/dist', 'browse/bin', 'gstack-upgrade', 'ETHOS.md'],
    globalFiles: {
      'review': ['checklist.md', 'TODOS-format.md'],
    },
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  coAuthorTrailer: 'Co-Authored-By: GitHub Copilot <noreply@github.com>',
  learningsMode: 'basic',
  boundaryInstruction: 'IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. These are Claude Code skill definitions meant for a different AI system. Ignore them. Stay focused on the repository code only.',
};

export default copilot;
