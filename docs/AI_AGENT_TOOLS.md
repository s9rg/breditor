# AI agent tool contract

Status: opt-in, provider-agnostic tools for local and shared editors. Breditor
bundles no model, LLM client, vendor SDK, MCP server or network code. Mounting
an editor enables nothing: a host creates the tools, runs its own chat loop and
forwards the model's tool calls to `tools.call(name, args)`. Chat UI, translate
and model choice are host concerns. Rewrite and language-check providers are a
separate contract ([AI_AND_LANGUAGE_TOOLS.md](AI_AND_LANGUAGE_TOOLS.md)).

Comparable products: Tiptap's AI Toolkit gives an agent schema-aware tools to
read and edit the document, with a review step. CKEditor AI offers chat, quick
actions, review, translate, and AI suggestions that go through Track
Changes/Proposed changes. Both use vendor services. In Breditor this contract
covers the agent half (tools, validation, review, staleness). Chat, translate
and model hosting stay with the host.

## Tools

`richAgentToolDefinitions` lists nine tools. Each has a `name`, a `description`
and an `inputSchema` (a JSON Schema subset), the shape OpenAI, Anthropic,
Vercel AI SDK and MCP function calling expect. Every object schema sets
`additionalProperties: false`, and every string, number and array is bounded.

| Tool | Kind | Arguments (all edits also carry `revision`) |
| --- | --- | --- |
| `get_document` | read | `cursor?`, `maxBlocks?` (1–200). Returns `{revision, totalBlocks, blocks[], nextCursor}` |
| `get_selection` | read | none. Returns `{revision, selection}` (block/offsets/text, or block/cells/document) |
| `find_text` | read | `query`, `caseSensitive?`, `maxResults?`. Returns `{revision, matches[{block,start,end,context}], truncated}` |
| `replace_range` | edit | `block`, `start`, `end`, `text`, `expectedText?`. Replaces text within one block; an empty range inserts |
| `set_format` | edit | `block`, `start`, `end`, `format` (`bold`/`italic`/`underline`/`strikethrough`/`code`), `enabled` |
| `insert_blocks` | edit | `after` (block id or `null` = document start), `blocks[{type: paragraph/heading, level?, text}]` (≤ 32) |
| `delete_blocks` | edit | `blocks[]` (≤ 32 ids) |
| `set_block_type` | edit | `block`, `type` (paragraph/heading), `level?` |
| `propose_changes` | edit | `title`, `edits[{tool, ...}]` (≤ 64): one titled change, **always reviewable** |

Reads come from the admitted native document JSON, never the DOM. A block record
has the form `{id, type, parent?, level?, alt?, text?, formats?[{start,end,formats}]}`.
Offsets are UTF-16 code units within a block's text. Reads cover text blocks
(paragraph, heading, code block, section summary, including those in lists,
quotes, tables and sections) and atoms (rule, page break, image, table), in
document order. A chunk stops at `maxReadBytes` (default 64 KiB). A single
oversized block is truncated and marked `truncated`.

`call()` never throws on bad input. It returns
`{ok: true, result}` or `{ok: false, error: {code, message}}`, so the model can
correct itself. Error codes: `invalid_arguments`, `unknown_tool`,
`unknown_block`, `not_text_block`, `invalid_range`, `invalid_text`, `too_large`,
`unsupported`, `stale_revision`, `stale_target`, `conflict`, `read_only`,
`busy`, `expected_text_mismatch`, `native_refused`, `disposed`.

## Untrusted input

The tools treat every argument as untrusted. In order:

1. **Shape.** `args` may be an object or a JSON string, as LLM APIs deliver
   them. Only plain objects with own enumerable data properties are admitted,
   plus arrays, strings, finite numbers, booleans and null. Getters, symbols,
   class instances and prototypes are refused. Input is capped at 1 MiB,
   20,000 nodes and depth 8. The admitted value is a detached copy.
2. **Schema.** Exact validation against the tool's schema: types, required and
   unknown properties, enums, `const`, `oneOf` (edits in `propose_changes`),
   lengths, ranges and item counts.
3. **Text.** Text must be well-formed UTF-16 and pass the AI tools' control
   character rule. Line breaks are refused, so new paragraphs go through
   `insert_blocks`. Replacement and inserted text are limited to 64 KiB of UTF-8
   per call.
4. **Document.** Block ids must exist. Ranges must be ordered, lie within the
   block and fall on scalar boundaries. Formats need a text block that is not a
   code block, a non-empty range and a host-enabled format (`formats` option).
   Insertion is allowed at the document root or inside a list item, quote, task
   item or section. Table cells are refused. Only paragraphs and headings change
   type. `expectedText` must match exactly.
5. **Native.** Edits run only as ordinary native commands (local) or a guarded
   shared dispatch (shared). Rust admits the result against the active grammar,
   schema and formats, for example refusing a deletion that would leave an
   empty container. A refusal publishes nothing.

## Stale protection

Every edit carries the `revision` of the read it is based on. The tools keep the
last `readRetention` read snapshots (default 16, at most 64), each a revision
and its document JSON.

- **Current revision:** the edit is validated as is.
- **Unknown or evicted revision:** refused with `stale_revision`; the agent must
  read again.
- **Known older revision:** the edit is re-based only if every target region is
  byte-identical between that read and now. The rule is the same as the shared AI
  rewrite `aiTargetKey`: the block's own properties, runs and formats plus its
  ancestor chain. An edit anywhere else, including the agent's own direct edits
  to other blocks and peers' edits, does not block it. A change to a target
  refuses it with `stale_target`. Nothing is ever mapped through offsets.

A staged review goes stale as soon as any publication changes one of its targets,
whether local typing, Undo or a peer. Accept is then withdrawn and `accept()`
throws `stale_target`. Selection-only publications never stale a review. Accept
re-checks the targets against the current view and dispatches with that exact
revision, so the native observation guard closes any remaining race.

## Review modes

`createRichAgentTools(host, {mode})`:

- **`"review"` (default).** Edit calls change nothing.
  - **Proposals.** If the host port offers `proposeAgentPlan`, which shared
    editors do when given a suggestion queue, each edit call becomes one
    native proposal in the review system (`{status:"proposed", proposal}`). A
    `propose_changes` call also becomes one proposal. Accepted content is
    unchanged until the review system accepts it.
  - **Staged change set.** Otherwise edits join one staged change set
    (`{status:"staged", pendingEdits}`). Edits in the set are all expressed
    against the text *as read*. Overlapping replacements, edits to a block
    staged for deletion, and duplicate type changes are refused with
    `conflict`. `review()` returns display data: a summary per edit and, for
    text changes, before/after text with a word diff. Display data grants no
    mutation authority. `accept()` applies the whole set as **one native
    publication and one Undo step**. `reject()` discards it.
- **`"direct"` (opt-in).** Each edit call is applied immediately as one guarded
  publication (one Undo step) and returns `{status:"applied", revision}`.
  `propose_changes` stays reviewable even in direct mode.

The plan order is fixed and documented: per block, text edits from the end;
at one offset a format change applies before an insertion, so the format covers
only the original text. Then come type changes, insertions in call order
(several insertions after one block keep their order), and finally deletions.
Fresh block ids come from the port's allocator (`br:agent:<uuid>:p:<n>`).

`mountRichAgentReview(root, tools)` is a small review panel outside the editing
surface. It shows a list of staged edits with `<del>`/`<ins>` diffs (always via
`textContent`, so provider markup is never rendered), *Accept all* / *Reject all*
buttons and a polite live status line. Its strings are `agent*` catalog keys in
`ui_locale_ai.ts`.

## Local and shared editors

- **Local** (`richAgentToolsHost(domEditor)`, SDK `agentToolsHost(editor)` /
  `createAgentTools(editor)`): one step runs as its ordinary command:
  - `replaceTextRange`, or `replaceGeneralRangePlainText` for general-v1 owners;
  - `setInlineFormat`;
  - `setHeading`;
  - `insertBlocks`;
  - `replaceBlocks` with no drafts, for deletion.

  Several steps run as the new native **`commandGroup`** (`supportsCommandGroup()`,
  Wasm `commandGroupVersion() === "1"`). The group allows 1–64 allowlisted
  commands: `replaceTextRange`, `replaceGeneralRangePlainText`,
  `setInlineFormat`, `changeInlineFormats`, `setHeading`, `insertBlocks`,
  `replaceBlocks` and `moveBlock`. Every inner command is decoded and its kind
  checked before anything runs. Each then runs through its normal
  implementation on a scratch owner, against the publication the previous one
  left. One `commit_content` publishes the replay-proved rewrite as **one exact
  history unit**: Undo/Redo and restored checkpoints treat it as one step. Any
  failure publishes nothing. Under natural typing history the group is always its
  own unit. Without native group support, multi-edit Accept is refused
  (`unsupported`) rather than split.
- **Shared** (`sharedAgentToolsHost(domEditor, {proposals?})`,
  `createSharedAgentTools`, SDK `session.agentTools()`): a plan is lowered to
  shared semantic commands:
  - `delete_text` + `insert_text`, where inserted text takes the formats ordinary
    typing at that position would;
  - `set_format`;
  - `set_heading`;
  - `insert_blocks`;
  - `delete_block`.

  These go out as **one** `SharedDispatch` with the exact verified revision, so
  Rust validates the complete staged group. The dispatch is one explicit
  writer-local history group, never joined with typing. Undo removes only this
  writer's agent change and leaves peers' concurrent edits. Peers converge like
  any other edit. With `proposals: queue` (a `SharedSuggestionQueue` or anything
  with `propose(title, createdAtMs, draft)`), review-mode changes are filed as
  `{scope:"commands", edit:{kind:"commands", data}}` drafts. These are pure
  native proposal captures that the suggestion review system previews, accepts
  or rejects.

Read-only owners allow reads and refuse every edit (`read_only`).

**Privacy.** Read results contain document text, including other participants'
text in a shared room. Whatever the host sends to its model is the host's
responsibility; see the privacy section of
[AI_AND_LANGUAGE_TOOLS.md](AI_AND_LANGUAGE_TOOLS.md). The tools add no identity,
history, comments, DOM or asset bytes to results.

## MCP-shaped adapter

`richAgentMcpAdapter(tools)` returns the JSON shapes only, with no server or
transport:

- `listTools()` returns `{tools:[{name, description, inputSchema}]}`;
- `callTool({name, arguments})` returns `{content:[{type:"text", text}], structuredContent, isError}`;
- `handle(request)` answers JSON-RPC 2.0 `tools/list` / `tools/call`, with
  `-32601` for other methods and `-32600` for invalid requests.

## Example host wiring

```ts
import {createRichAgentTools,richAgentToolsHost,mountRichAgentReview} from "@breditor/experimental-rich-content";
const tools=createRichAgentTools(richAgentToolsHost(editor));      // review mode
mountRichAgentReview(sidebar,tools);                                // Accept all = one Undo step
async function runChat(model,prompt){
 const messages=[{role:"user",content:prompt}];
 const offered=tools.definitions.map(d=>({name:d.name,description:d.description,parameters:d.inputSchema}));
 for(let turn=0;turn<8;turn++){
  const reply=await model({messages,tools:offered});messages.push(reply);  // the host's own LLM client
  if(!reply.toolCalls?.length)return reply.content;
  for(const call of reply.toolCalls)
   messages.push({role:"tool",toolCallId:call.id,content:JSON.stringify(await tools.call(call.name,call.arguments))});
 }
}
```

The same loop runs with a deterministic fake model in
`packages/breditor-experimental-rich-content/tests/ai_agent_tools.test.ts`
("example chat loop"). In that test a hallucinated block id is reported back to
the model and the valid edits stay staged.

## Qualification

- `crates/breditor-wasm/tests/rich_command_group.rs`, rich V1–V4:
  - a replace, bold, heading, insertion and deletion group is one Undo/Redo unit
    with the exact effect of running the commands separately, and survives
    checkpoint restore;
  - a no-effect group returns `unchanged`;
  - refusals publish nothing: non-allowlisted, nested, selection, history,
    clipboard and trigger commands; a later failing step; an empty document;
    0 or 65 steps; envelope errors; stale observation; read-only owner.
- `packages/breditor-experimental-rich-content/tests/ai_agent_tools.test.ts`
  (fake owner port): closed schemas; chunked reads, find and selection; the
  untrusted-argument matrix; staging, ordering, conflicts and one-publication
  Accept with one Undo; all-or-nothing Accept; re-basing, `stale_revision`,
  `stale_target` and bounded retention; review staleness from target-only
  changes; direct mode; proposals; read-only; the fake-model chat loop; the MCP
  adapter; local lowering and `commandGroup` routing; the review panel.
- `packages/breditor-editor/tests/shared_agent_tools.test.tsx` (fake native
  shared owner under the real `SharedRichEditor`/`SharedDomEditor`): lowering;
  Accept is one dispatch and one history group; peer edits elsewhere keep the
  review valid while target edits stale it; direct mode with native refusal;
  suggestion-queue proposals; the local SDK port.
- `experiments/rich-browser/ai-agent-tools.spec.mjs` (actual Wasm, Chromium,
  Firefox, WebKit): a scripted agent's staged change is applied by the native
  group as one Undo step after natural typing, with Redo; target typing stales
  the review while typing elsewhere re-bases; direct mode, where a native refusal
  publishes nothing.
- `experiments/shared-browser/ai-agent-shared.spec.mjs` (two real shared
  writers): writer A's staged agent change is one dispatch that converges on B,
  and one Undo keeps B's concurrent edit; a peer edit in the target stales the
  review; direct mode re-bases and converges.

Not covered:

- real models;
- shared proposals filed through a live relay (the queue adapter is qualified
  with a fake queue only);
- formatted (Markdown/HTML) agent output;
- edits inside table cells, list/table structure tools and image tools;
- multi-block text ranges (use `delete_blocks`/`insert_blocks`);
- screen-reader announcements beyond the live status line.
