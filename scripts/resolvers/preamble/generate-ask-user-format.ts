import type { TemplateContext } from '../types';

export function generateAskUserFormat(ctx: TemplateContext): string {
  if (ctx.host === 'copilot') {
    return generateCopilotAskUserFormat();
  }
  return `## AskUserQuestion Format

### Tool resolution (read first)

"AskUserQuestion" can resolve to two tools at runtime: the **host MCP variant** (e.g. \`mcp__conductor__AskUserQuestion\` — appears in your tool list when the host registers it) or the **native** Claude Code tool.

**Rule:** if any \`mcp__*__AskUserQuestion\` variant is in your tool list, prefer it. Hosts may disable native AUQ via \`--disallowedTools AskUserQuestion\` (Conductor does, by default) and route through their MCP variant; calling native there silently fails. Same questions/options shape; same decision-brief format applies.

**If no AskUserQuestion variant appears in your tool list, this skill is BLOCKED.** Stop, report \`BLOCKED — AskUserQuestion unavailable\`, and wait for the user. Do not write decisions to the plan file as a substitute, do not emit them as prose and stop, and do not silently auto-decide (only \`/plan-tune\` AUTO_DECIDE opt-ins authorize auto-picking).

### Format

Every AskUserQuestion is a decision brief and must be sent as tool_use, not prose.

\`\`\`
D<N> — <one-line question title>
Project/branch/task: <1 short grounding sentence using _BRANCH>
ELI10: <plain English a 16-year-old could follow, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what user sees, what's lost>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage — no completeness score)
Pros / cons:
A) <option label> (recommended)
  ✅ <pro — concrete, observable, ≥40 chars>
  ❌ <con — honest, ≥40 chars>
B) <option label>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of what you're actually trading off>
\`\`\`

D-numbering: first question in a skill invocation is \`D1\`; increment yourself. This is a model-level instruction, not a runtime counter.

ELI10 is always present, in plain English, not function names. Recommendation is ALWAYS present. Keep the \`(recommended)\` label; AUTO_DECIDE depends on it.

Completeness: use \`Completeness: N/10\` only when options differ in coverage. 10 = complete, 7 = happy path, 3 = shortcut. If options differ in kind, write: \`Note: options differ in kind, not coverage — no completeness score.\`

Pros / cons: use ✅ and ❌. Minimum 2 pros and 1 con per option when the choice is real; Minimum 40 characters per bullet. Hard-stop escape for one-way/destructive confirmations: \`✅ No cons — this is a hard-stop choice\`.

Neutral posture: \`Recommendation: <default> — this is a taste call, no strong preference either way\`; \`(recommended)\` STAYS on the default option for AUTO_DECIDE.

Effort both-scales: when an option involves effort, label both human-team and CC+gstack time, e.g. \`(human: ~2 days / CC: ~15 min)\`. Makes AI compression visible at decision time.

Net line closes the tradeoff. Per-skill instructions may add stricter rules.

12. **Non-ASCII characters — write directly, never \\u-escape.** When any
    string field (question, option label, option description) contains
    Chinese (繁體/簡體), Japanese, Korean, or other non-ASCII text, emit
    the literal UTF-8 characters in the JSON string. **Never escape them
    as \`\\uXXXX\`.** Claude Code's tool parameter pipe is UTF-8 native
    and passes characters through unchanged. Manually escaping requires
    recalling each codepoint from training, which is unreliable for long
    CJK strings — the model regularly emits the wrong codepoint (e.g.
    writes \`\\u3103\` thinking it is 管 U+7BA1, but \`\\u3103\` is
    actually ㄃, so the user sees \`管理工具\` rendered as \`㄃3用箱\`).
    The trigger is long, multi-line questions with hundreds of CJK
    characters: that is exactly when reflexive escaping kicks in and
    exactly when miscoding is most damaging. Long ≠ escape. Keep
    characters literal.

    Wrong: \`"question": "請選擇\\uXXXX\\uXXXX\\uXXXX\\uXXXX"\`
    Right: \`"question": "請選擇管理工具"\`

    Only JSON-mandatory escapes remain allowed: \`\\n\`, \`\\t\`, \`\\"\`, \`\\\\\`.

### Self-check before emitting

Before calling AskUserQuestion, verify:
- [ ] D<N> header present
- [ ] ELI10 paragraph present (stakes line too)
- [ ] Recommendation line present with concrete reason
- [ ] Completeness scored (coverage) OR kind-note present (kind)
- [ ] Every option has ≥2 ✅ and ≥1 ❌, each ≥40 chars (or hard-stop escape)
- [ ] (recommended) label on one option (even for neutral-posture)
- [ ] Dual-scale effort labels on effort-bearing options (human / CC)
- [ ] Net line closes the decision
- [ ] You are calling the tool, not writing prose
- [ ] Non-ASCII characters (CJK / accents) written directly, NOT \\u-escaped
`;
}

function generateCopilotAskUserFormat(): string {
  return `## Decision Prompt Format (Copilot CLI: use the \`ask_user\` tool)

### Tool resolution (read first)

In GitHub Copilot CLI, every "decision prompt" or "STOP gate" in this skill is delivered through the native **\`ask_user\`** tool. Schema:

- \`ask_user(question: string, choices?: string[], allow_freeform?: boolean)\`
- One question per call. Choices are plain strings, not objects.
- Copilot CLI auto-adds a freeform input slot, so do NOT include "Other" / "Something else" in \`choices\`.

**Rule:** any time the skill body says "ask the user," "ask via ask_user," "decision brief," or "STOP and ask," that means call the \`ask_user\` tool. Pass the \`D<N> — <title>\` line as \`question\`. Pass the option labels (e.g. \`"A) Build on prior design (recommended)"\`, \`"B) Start fresh"\`) as \`choices\`. Emit the rest of the decision brief — ELI10, Stakes, Recommendation, Pros/cons, Net — as **prose in the same response, immediately above the tool call**, so the user sees the reasoning before they see the choices.

**If \`ask_user\` is not in your tool list, this skill is BLOCKED.** Stop, report \`BLOCKED — ask_user unavailable\`, and wait for the user. Do not write the decision to the plan file as a substitute. Do not emit the question as prose and continue. Do not silently auto-decide.

**Autopilot is NOT a license to skip these gates.** Skill-driven STOP gates exist for product, design, and scope decisions where the user's judgment is the actual deliverable. Even in autopilot mode, you MUST call \`ask_user\` and wait. Auto-deciding here is the failure mode this rule exists to prevent. The only sanctioned auto-decide is the \`/plan-tune\` AUTO_DECIDE opt-in for specific question_ids the user has explicitly tuned.

### Format

The decision brief is **prose above the tool call**, not a tool argument. The \`ask_user\` invocation itself is short.

Prose format (write this in your response, immediately before calling \`ask_user\`):

\`\`\`
D<N> — <one-line question title>
Project/branch/task: <1 short grounding sentence using _BRANCH>
ELI10: <plain English a 16-year-old could follow, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what user sees, what's lost>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage — no completeness score)
Pros / cons:
A) <option label> (recommended)
  ✅ <pro — concrete, observable, ≥40 chars>
  ❌ <con — honest, ≥40 chars>
B) <option label>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of what you're actually trading off>
\`\`\`

Tool call format (immediately after the prose):

\`\`\`
ask_user({
  question: "D<N> — <one-line question title>",
  choices: [
    "A) <option label> (recommended)",
    "B) <option label>"
  ]
})
\`\`\`

D-numbering: first question in a skill invocation is \`D1\`; increment yourself. This is a model-level instruction, not a runtime counter.

ELI10 is always present, in plain English, not function names. Recommendation is ALWAYS present. Keep the \`(recommended)\` label inside one of the \`choices\` strings; the recommendation marker stays visible to the user and to any AUTO_DECIDE logic.

Completeness: use \`Completeness: N/10\` only when options differ in coverage. 10 = complete, 7 = happy path, 3 = shortcut. If options differ in kind, write: \`Note: options differ in kind, not coverage — no completeness score.\`

Pros / cons: use ✅ and ❌ in the prose. Minimum 2 pros and 1 con per option when the choice is real; minimum 40 characters per bullet. Hard-stop escape for one-way/destructive confirmations: \`✅ No cons — this is a hard-stop choice\`.

Neutral posture: \`Recommendation: <default> — this is a taste call, no strong preference either way\`; \`(recommended)\` STAYS on the default option for AUTO_DECIDE.

Effort both-scales: when an option involves effort, label both human-team and CC+gstack time, e.g. \`(human: ~2 days / CC: ~15 min)\`. Makes AI compression visible at decision time.

Net line closes the tradeoff. Per-skill instructions may add stricter rules.

**Non-ASCII characters — write directly, never \\u-escape.** When any \`question\` or \`choices\` string contains Chinese (繁體/簡體), Japanese, Korean, or other non-ASCII text, emit the literal UTF-8 characters. Copilot CLI's tool parameter pipe is UTF-8 native and passes characters through unchanged. Manually escaping requires recalling each codepoint from training, which is unreliable for long CJK strings.

Wrong: \`question: "請選擇\\uXXXX\\uXXXX\\uXXXX\\uXXXX"\`
Right: \`question: "請選擇管理工具"\`

### Self-check before emitting

Before calling \`ask_user\`, verify:
- [ ] D<N> header present in prose AND as the \`question\` string
- [ ] ELI10 paragraph present in prose (stakes line too)
- [ ] Recommendation line present with concrete reason in prose
- [ ] Completeness scored (coverage) OR kind-note present (kind) in prose
- [ ] Every option has ≥2 ✅ and ≥1 ❌ in prose, each ≥40 chars (or hard-stop escape)
- [ ] (recommended) label on one option string inside \`choices\`
- [ ] Dual-scale effort labels on effort-bearing options (human / CC)
- [ ] Net line closes the decision in prose
- [ ] You are calling \`ask_user\`, not just writing prose and continuing
- [ ] Non-ASCII characters (CJK / accents) written directly, NOT \\u-escaped
`;
}
