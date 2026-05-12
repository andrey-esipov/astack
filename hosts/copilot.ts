import type { HostConfig } from '../scripts/host-config';

/**
 * GitHub Copilot CLI host.
 *
 * Copilot CLI exposes two customization surfaces:
 *   1. Skills (SKILL.md files invoked as /<name> slash commands by the user)
 *   2. Agents (.agent.md files invoked as tools by the model)
 *
 * gstack content is overwhelmingly "skills" in Copilot's sense — workflows
 * a user invokes (/qa, /review, /ship, /autoplan, ...). This host emits
 * SKILL.md files via the standard per-skill-dir layout. Setup installs them
 * as flat top-level personal skills under ~/.copilot/skills/<name>/SKILL.md
 * so Copilot CLI's /skills registry and slash picker can see them.
 *
 * Schema reference:
 *   https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
 */
const copilot: HostConfig = {
  name: 'copilot',
  displayName: 'GitHub Copilot CLI',
  cliCommand: 'copilot',

  // Runtime assets live outside the skill discovery tree. The installed skill
  // dirs under ~/.copilot/skills stay tiny and point here through $GSTACK_ROOT.
  globalRoot: '.copilot/gstack',
  // Copilot project skills can live in .github/skills. A repo-local astack
  // runtime can use this shape without competing with personal skills.
  localSkillRoot: '.github/skills/gstack',
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
    // Bash blocks inside skills reference ~/.claude/skills/gstack/bin/... for
    // sidecar tooling (telemetry, learnings, gbrain). Route them to the
    // Copilot runtime root that setup creates at ~/.copilot/gstack/.
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
    globalSymlinks: [
      'bin',
      'browse/dist',
      'browse/bin',
      'design/dist',
      'design-html/vendor/pretext.js',
      'document-release',
      'extension',
      'gstack-upgrade',
      'make-pdf/dist',
      'office-hours',
      'plan-ceo-review',
      'plan-design-review',
      'plan-devex-review',
      'plan-eng-review',
      'ETHOS.md',
      'VERSION',
    ],
    globalFiles: {
      'review': ['checklist.md', 'design-checklist.md', 'greptile-triage.md', 'TODOS-format.md'],
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
