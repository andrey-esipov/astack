import type { HostConfig } from '../scripts/host-config';

/**
 * GitHub Copilot CLI host.
 *
 * Copilot CLI discovers custom agents as flat `.agent.md` files in
 * `~/.copilot/agents/`. Each file has YAML frontmatter (name, description,
 * tools, target, etc.) followed by markdown instructions. Invoke with
 * `copilot --agent <name>`.
 *
 * Schema reference:
 *   https://docs.github.com/en/copilot/reference/custom-agents-configuration
 *
 * gstack skills are emitted as `gstack-<skill>.agent.md` (flat with prefix —
 * Copilot CLI does not recurse into subdirectories under ~/.copilot/agents/).
 */
const copilot: HostConfig = {
  name: 'copilot',
  displayName: 'GitHub Copilot CLI',
  cliCommand: 'copilot',

  globalRoot: '.copilot/agents',
  localSkillRoot: '.copilot/agents',
  hostSubdir: '.copilot',
  usesEnvVars: true,

  outputLayout: 'flat-agent-md',

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'truncate',
    extraFields: {
      target: 'github-copilot',
      // gstack skills need broad tool access. Emit as YAML array via stringified literal —
      // transformFrontmatter does string-interpolation, so the value is rendered verbatim.
      tools: '["*"]',
    },
  },

  generation: {
    generateMetadata: false,
    // The /copilot gstack skill itself shells out to the `copilot` CLI binary —
    // exposing it as a copilot agent would let Copilot recurse on itself.
    skipSkills: ['copilot'],
  },

  pathRewrites: [
    { from: '~/.claude/skills/gstack', to: '$GSTACK_ROOT' },
    { from: '.claude/skills/gstack', to: '.copilot/skills/gstack' },
    { from: '.claude/skills', to: '.copilot/skills' },
  ],

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
