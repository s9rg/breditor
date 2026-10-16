# Native general range replacement contract

General text replacement now has a Rust plan and local session action. It
preserves partially selected tables, images and structural owners rather than
flattening them. The owner approved this policy: remove only selected content
inside partial structures, remove whole enclosed atoms, and insert replacement
text at the selection's logical beginning.

The local foundation, explicit shared semantic history and guarded Wasm/source
facade commands are implemented. Explicit root SDK options and durable general
sessions now connect native plain input to vanilla/React controllers. General
rich clipboard, cross-range paragraph Enter, explicit caption/code text paste
and transport V2 have functional checkpoints below. Document-wide Select All,
external interchange and final integrated qualification remain required.

## Original joins and protected boundaries

`RichGeneralRangePlan::capture` first tries the original `ReplaceTextRange`.
Same-block, legal sibling-flow and ordinary sibling-list-head replacements keep
their exact join semantics. Only the original unsupported-flow error selects
the new coverage planner; invalid coordinates, source proofs and other failures
are not converted to a fallback. Original actions and session methods remain
strict and unchanged.

For the additional ranges, native AST order determines the logical beginning,
independent of anchor/focus direction. Distinct boundary text blocks retain their
identities, kinds, layout, unselected prefix or suffix and structural owners.
The new action trims their selected text without joining across cells, captions,
different list bodies, quotes or code/prose boundaries. Complete enclosed
subtrees are removed; their descendants are not separately removed.

A partial table retains every row, column, source-cell identity, header value
and merge. Fully selected bodies inside that retained table receive empty
paragraphs, not deleted axes or a replacement table. A partial image retains its
asset and properties while its caption text is trimmed. A wholly enclosed image
or table is removed. Selection coverage retains source-cell ownership rather
than replacing it with the visible merged master.

A partial list or task item retains its unselected tail and completion state.
When removal leaves a non-prose first child, a new empty paragraph becomes its
required head. An already retained prose child can serve as the head. A new
paragraph has no inherited block layout; retained blocks keep their own values.
Code retains its kind and rejects formatted insertion atomically instead of
discarding styles.

## Fresh identities and admission

`empty_blocks()` returns the required fresh paragraphs in native plan order,
each with a retained parent and optional following sibling. The host supplies
exactly one durably fresh block ID for each requirement. The core rejects wrong
counts, duplicates and reuse of any source ID, including a removed block. As
with existing insertions, the host must also avoid IDs in discarded history or
other durable work; the current document alone cannot prove historical freshness.

`text_ranges()` contains only changed retained text blocks. A lowering must
insert runs only when a returned range belongs to `insertion_start()`. An
unchanged replacement may omit that first block. `deleted_blocks()` contains
maximal removed roots, not every removed descendant.

The native work count includes changed text blocks, removed roots and new
paragraphs. It must fit the existing transaction action limit. Source binding,
scalar-aligned UTF-16 offsets, schema, document limits and inserted rich runs
remain mandatory. The final tree is admitted once; there is no published
intermediate state with an empty cell or invalid item head. Stale sources,
invalid formats or any late failure retain content, selection, pending formats
and both history stacks.

The planner and its postordered materialization use explicit stacks, including
when a host admits depth beyond the ordinary default. This does not make the
rest of the document engine iterative or relax existing depth limits.

## Local session and history

`plan_general_selection_text` is a guarded read and remains legal in read-only
mode. `replace_general_selection_text` checks the current observation and write
policy, captures one action, and publishes one collapsed caret at the logical
beginning plus inserted length. Nonempty insertion sets pending formats from
its final run; deletion uses native mapping. An empty insertion at a caret is a
true no-op, preserving affinity, the observation and Redo.

The named action is `ReplaceCoveredRange`. Its exact inverse restores the
original AST and selection through the existing local history machinery.
Multiple witnessed text maps retain surviving positions; removed positions
retain existing domain-aware recovery, including a fresh paragraph in the same
source cell. Runtime root splicing is local only. It must never become a shared
root register that overwrites concurrent peer work.

No schema, selection, checkpoint or journal format changes. Local explicit and
natural histories serialize through the existing guarded local rewrite recipe.
The earlier V3 Wasm binary restores twelve new checkpoints and matches all
forty-eight subsequent Undo/Redo checkpoints exactly. That establishes saved
history compatibility, not support for a new editing request in that binary.

## Integration requirements

Shared lowering must preserve causal text, independently owned metadata and
selective Undo. It must verify the complete staged result against the native
preview and retain native resource ceilings and original command limits. Required fresh paragraph
births cannot justify a root replacement or an invalid intermediate cell/item.
Sequential admission and transient resource requirements need explicit tests.

Wasm and SDK integration need an explicit capability and closed guarded
requests. Browser controllers must use native plans, not infer removal from DOM
order. Original cross-cell drag still produces a Grid selection; explicit
general mode retains the browser's partial text endpoints instead. General
visual-order ranges, whole-document Select All including leading/trailing atoms,
gap/drop positions and external interchange remain distinct contracts.

Native tests cover every pair of twenty-one fixture text blocks in both
directions with deletion and Unicode insertion: 840 scenarios. Separate cases
check merged table geometry, task heads, captions/assets/layout, formatted
suffixes, code refusal, source/policy/ID/resource guards, mappings, exact inverse
and explicit/natural restart. Browser, shared-concurrency and accessibility
results from earlier features do not qualify these new editing requests.

The [native qualification](qualification/2026-10-16-general-range-native.json)
binds 2,453 passing root Rust tests, 321 existing shared regression tests,
default JavaScript regressions and the actual earlier-runtime comparison to the
tested source checkpoint. Strict native/Wasm lint, Rustdoc and ordinary
feature-disabled builds pass. The readiness row remains partial.

## Initial shared adapter

`plan_general_selection_text_guarded` reads native requirements under the exact
shared observation. `replace_general_selection_text_guarded` admits a complete
local semantic preview, then lowers it to original `PasteBlocks`, same-block
`ReplaceTextRange` and `DeleteBlock` records in one selective history group.
Original supported joins retain their single original command. New paragraphs
use original paste preparation so conditional heads participate in exact
recovery. No shared root register or copied surviving text is introduced.

The complete staged document must equal the native result before adoption.
Pending formats and the final caret come from the same native preview. True
no-ops preserve the observation and Redo; UI-only collapse creates no content
history. Native plans can be read in read-only mode, while mutation still
requires write permission. Shared historical definitions reject fresh-floor ID
reuse even when the current AST no longer contains that ID.

The original 64-command ceiling remains strict. The adapter accepts at most
1,000 insertion runs and 64 KiB of insertion text, matching the existing shared
range input. Styles use the native literal codec. No model, frame, journal,
schema or default-constructor meaning changes. The actual earlier V3 shared
Wasm binary restores twelve produced checkpoints and matches forty-eight future
Undo/Redo checkpoints exactly.

Tests compare native results across merged source cells, partial captions,
mixed containers, old supported joins and code/prose boundaries in both
directions and both history families. Offline peer prefix/suffix text and image
metadata survive selective Undo. A separate case confirms that omitting an
unchanged first text block does not duplicate its insertion.

## Explicit shared semantic history

The original history family still atomically refuses two cases. They cannot be
repaired by silently changing old command meanings:

1. Delete a cell's only ordinary paragraph, type into its generated head, and
   split that head. Select from a different cell into the retained right
   sibling. The native result removes the generated head without needing a
   fresh paragraph. The original command group does not retain its conditional
   origin, so ordinary deletion cannot express the result. Final native-result
   comparison refuses the request without changing the live owner.
2. Tighten the active node budget to the source document's exact size, then
   replace across cells that need fresh empty paragraphs. The native final tree
   fits. Original paste admission checks paragraph insertion before the selected
   removals, so it unnecessarily requires temporary extra nodes and refuses.

The explicit `enable_general_ranges_guarded` path repairs both cases through
one named `ReplaceGeneralTextRangeV1` action. Preparation retains conditional
origins and defines fresh paragraphs outside Undo, without changing visible
content. One native history span then publishes births, trims causal text and
deletes maximal roots. Only its complete final AST is admitted. The staged
result must equal the independent native preview before publication. No copied
surviving text, temporary user block, extra resource headroom or shared root
register is introduced.

This one-way opt-in preserves existing content, frames and both stacks, but
selects separate local replay families. Ordinary saves declare
`breditor/rich-replica-general-journal` version 1. Natural saves declare
`breditor/shared-general-typing-session` version 1 with the matching
`breditor/rich-replica-general-typing-journal` inner family. Their original
causal model and journal binding remain explicit; language revisions 1, 2 and 3
retain models 11, 12 and 13 respectively. `general_checkpoint` and
`general_typing_checkpoint` require their corresponding mode.
`restore_general` and `restore_general_typing` never guess a family or silently
upgrade an original save. Original factories reject these new saves.

The original command-group limit remains 64. A semantic range is one action;
its expanded native work must fit the existing transaction limit rather than
being counted as an original command batch. Insertions retain the existing
1,000-run and 64 KiB bounds. Invalid current or historical floor IDs, stale
observations, read-only policy and late final-limit failures publish nothing.

`replace_general_typing_text_guarded` starts a new natural group for a selected
range. Following same-caret input can join under the existing time, style and
step rules. The semantic replacement never joins preceding input. Empty input
does not delete a selection; line separators isolate the group. Exact recovery
retains the first selection, source text and joined history.

Application Wasm has explicit editing, recovery and matching save getters.
Native-to-release-Wasm checks cover both
directions, strict source-sized node limits, generated heads, captions and
joined first-key input. The earlier shared Wasm imports the resulting peer
frames while rejecting the new local save families. Peer-frame compatibility
does not make original readers able to replay new local history.

## Explicit browser input targets

Browsers may replace a target range while the actual visible selection is a
different caret or node. The new `replace_general_range_text`,
`replace_general_range_plain_text` and `replace_general_range_typing_text`
methods do not publish that target as a temporary selection. Their before-UI
recipe retains the actual selection and pending styles, even if the operation
removes the entire block holding that caret. Shared lowering compares the
complete native preview while retaining that same actual before-UI.

`RichGeneralPlainRangePlan` owns the admitted input fragment, effective formats
and native coverage/floor requirements. Plain input inherits the actual caret's
style when that caret lies inside a boundary block of the target. Otherwise the
logical start's affinity chooses its style; an unrelated pending override cannot
leak into the replacement. Explicit plain deletion retains that native input
style at the resulting caret. Rich-run deletion instead maps actual pending
styles through the action. First-key replacement never joins an earlier burst;
subsequent same-caret typing can join under the existing native rules.

Local Wasm exposes separate `replaceGeneralRangeText`,
`replaceGeneralRangePlainText` and `replaceGeneralRangeTypingText` commands.
Shared Wasm exposes corresponding guarded methods only after explicit semantic
history admission. Both advertise general range capability string `1`.
Original range commands and original factories retain their meanings.

Each closed request supplies an explicit text selection and a host-reserved
fresh namespace prefix. Rust plans the exact number of required paragraphs and
allocates `prefix:range:ordinal` IDs. Prefixes admit at most 90 UTF-8 bytes and
must remain durably unused after failures, Undo or discarded work. This
spelling contract is not proof of durability; native source/historical ID checks
still apply. JavaScript never counts floors or selects removal roots.

Plain requests supply text; rich requests supply canonical nonempty runs with
literal-array `formatsJson` strings; typing requests add a canonical decimal
`clockMs`. Requests retain the 1 MiB envelope, 1,000-run and 64 KiB text limits.
Unknown fields, number-valued coordinates/clocks, unadmitted literal formats,
duplicate adjacent run styles, malformed namespaces and late failures reject
atomically. Stale observations reject before request decoding. Mutation also
requires current write policy and, for first-key input, natural history.

Source facades expose these named capabilities and explicitly paired general
recovery, without an original-command fallback. Shared observations report
`rangeEditing: general-v1` only in the new mode. A recovered new-mode owner with
an incomplete paired runtime rejects before ownership transfer. Its ordinary
and natural save getters remain distinct. Durable sessions seal their selected
range policy, preventing a live upgrade behind the storage record's identity
guard. Reopening with an explicit opt-in can upgrade an original record as
described below.

The [input bridge qualification](qualification/2026-10-16-general-range-input-bridge.json)
records actual release Wasm through source facades: fourteen scenarios, seventy
matching local/shared documents and 112 exact future checkpoint comparisons.
Earlier local and general-shared binaries restore all twenty-eight resulting
saves and match 112 future checkpoints. These include a fully deleted
before-caret block and clocks above JavaScript's safe-integer range. The local
runtime keeps its existing default document limits; only the shared fixture
explicitly tightens its node budget to the source size.

## Durable sessions and browser routing

`openLocalEditor` and `openSharedEditor` accept immutable
`rangeEditing: 'general-v1'`; omitted or `'original'` retains the original input
contract. Both React components apply this option once per `sessionKey`.
Parent renders cannot silently change a live owner's replay policy or reset its
history. Local checkpoints retain their existing ordinary/natural families;
local general routing is an explicitly reapplied controller option.

Shared general records use a separate IndexedDB value:

```json
{
  "format": "breditor/shared-general-checkpoint-record",
  "formatVersion": 1,
  "history": "explicit",
  "richLanguage": 3,
  "checkpointJson": "opaque native general journal"
}
```

The exact five keys declare the family outside opaque Rust JSON. `history` is
`explicit` or `typing-v1`; `richLanguage` is 1, 2 or 3. Unknown keys, versions or
values reject. Legacy strings and original typing records retain their exact
old shapes and restore callback arity. The legacy string-only reader refuses
general records. The 16 MiB journal ceiling and origin-wide exclusive writer
lease remain unchanged.

Opening a stored general record requires an explicit matching range/language
option and, for natural history, explicit `history: 'typing-v1'`. Storage checks
record identity; Rust admits the actual origin, schema, causal model and replay.
In particular, an ordinary general journal has no language header: changing the
outer record's label cannot make another native profile admit it. A failed
upgrade leaves the exact old durable value intact and frees the unannounced
owner. A failed close retires authoring but retains the exact readable journal
and writer lease until retry or explicit discard.

First-opening seeds add explicit `{kind: 'generalCheckpoint', checkpointJson}`
and `{kind: 'generalTypingCheckpoint', checkpointJson}` variants. These choose
the corresponding native restore factory and defaults, never sniff the JSON or
fall back to an original factory. Existing durable records still take precedence
over seeds. `rangePolicy()` and `historyPolicy()` on new recovery producers
retain the two independent policy choices through failed mount/close handoff.
Hosts must also retain the selected language and profile configuration.

General-mode controllers retain cross-cell browser ranges as text selections;
explicit cell-picker grid selections remain separate. Typing, replacement,
selected deletion, Shift+Enter and plain paste submit a closed native target and
fresh request namespace. Browser target ranges never become temporary native
selections. A target at the actual caret retains its logical affinity, allowing
the native natural-typing continuation rule to apply. Adjacent same-block
natural deletion retains its existing grouping action. Shared routing follows
the observed native mode; local routing requires the explicit immutable option.
An unavailable native capability rejects before mounting; neither controller
implements a JavaScript AST rewrite.

## Packing independent writer transport

Relay admission reproduced a separate transport fault. The sender exported 237
identical operations in two engine changes; binary import repacked them into
one change. Original version-one lineage hashes include change boundaries, so
the receiver correctly refused its mismatched digest despite identical causal
operations. Original format meanings and checks remain unchanged.

The additive `writer_clock_v2`, `writer_groups_v2_guarded` and
`prepare_writer_group_v2` APIs select version-two group, batch and lineage
formats explicitly. Each digest hashes a binding header followed by ordered
causal atoms. Records use recursively sorted JSON object keys and an unsigned
big-endian 64-bit byte-length prefix. Every atom retains author/counter,
container, operation payload, Lamport clock and immediate causal dependencies.
Unicode insertion and list runs expand into individual atoms; reverse deletes
normalize to their equivalent single-atom direction. Nonsemantic engine commit
messages and wall clocks are excluded. Change and run packing are not identity.

Payload digests, authenticated author/range checks, dependencies, fork detection,
room/schema/model bindings, whole-result admission, byte limits and exact
publication fencing remain mandatory. Original and version-two entry points
reject each other's envelopes. Existing receipt and clock shapes are reused
only in their explicitly selected transport context; their digest domains are
different. Tests compare every sliced interval against the pinned engine's own
singleton exporter and freeze an independently generated wire hash. The relay
reproducer also checks duplicate delivery and future Undo/Redo with server
recovery. Version-two transport still needs Wasm, SDK and reference-relay wiring.

## Native general clipboard

General Copy is an explicit native read, separate from the original clipboard
read. Local owners declare `generalCopyVersion()` and observations expose
`generalClipboardJson()`; the local facade supplies `supportsGeneralCopy()` and
`generalClipboard()`. Shared owners declare `general_copy_version()` and expose
the guarded `copy_general_clipboard()` read, surfaced as `copyGeneral()`.
Neither Copy read changes the document, selection, pending formats or history.
Read-only owners can copy; shared stale or foreign observations still reject.

For a text range crossing table cells, rich Copy retains the complete table
shape, widths, header flags and active merges. Unselected cell bodies become
neutral empty paragraphs rather than copied source content. Partial images
contribute only selected caption text, without their unselected asset or alt
fields. Fully selected images retain their asset references and captions.
Partial list and task wrappers retain valid heads without borrowing unselected
text or formatting. Original supported text, node and grid captures keep their
existing output. The rich clipboard envelope remains version one; clipboard
identities are still re-keyed before insertion.

Inline rich paste uses the separate `generalInlinePasteVersion()` or shared
`general_inline_paste_version()` capability. The closed
`pasteGeneralInlineClipboard` request carries `selection`, `clipboardJson` and
`prefix`. Rust decodes the opaque clipboard, admits its complete inline marks
and derives the coverage and required floor IDs. Pending typing styles do not
override the copied styles. Existing general-range replay entries retain their
meaning.

Structured paste declares a third capability, `generalFlowPasteVersion()` or
shared `general_flow_paste_version()`. The native plan trims general coverage,
splits its retained prose start and inserts freshly keyed rich blocks before
the retained suffix. One publication and history unit retain the actual
before-selection and pending formats. A source ID cannot be reintroduced as a
fresh pasted ID merely because the range deletes its original block.
The local command also takes a native clipboard allocation record. The shared
request takes `selection`, `clipboardJson`, `prefix` and `right`, and saves the
additive `paste_general_flow_at_text_v1` command only in explicitly selected
general history. Older runtimes reject the unknown command rather than
reinterpreting an original paste entry. Prior commands and journal meanings are
unchanged. The structured flow-paste command itself still rejects caption/code
starts. The separately selected text-with-losses policy below handles those
targets before any mutation; failed structured paste never triggers it.

General-mode DOM Copy and Cut use the native general read. Cut submits one
general deletion only after the event clipboard retains the supplied plain
text. Missing capabilities or failed clipboard retention do not delete content.
Inline and structured paste forward the rich JSON to Rust without rebuilding
its tree in JavaScript or silently substituting plain text.

For composition over a cross-block general range, controllers retain the
original target and publication until `compositionend`. The event's final
committed text becomes one native general plain replacement; provisional DOM
mutations are not parsed into document edits. An empty final composition cancels
without deleting the selection. Shared composition holds remote publication
until commit or cancellation. Existing same-block composition is unchanged.
These routing contracts do not qualify physical IME behavior.

The [functional clipboard checkpoint](qualification/2026-10-16-general-clipboard-functional.json)
retains the tested source, actual release-runtime hashes, focused native/SDK
results and clean-install artifacts. Its source-facade probe compares local and
shared documents and exact future history; browser and OS clipboard qualification
remain separate.

## Native general paragraph editing

`insertGeneralParagraph` takes only an explicit text `selection` and a fresh
`prefix`. Rust derives the exact empty floors, suffix paragraph and optional
item identities. `RichGeneralParagraphPlan` first trims the general coverage,
then inspects the retained source. A leading ordinary-list head splits into a
new list item; a leading task head creates an unchecked right task while
retaining the left completion. Other prose splits in its existing flow owner.
The right text block is a paragraph, retaining the suffix formats and inherited
V3 layout. Partial tables, images, lists and tasks retain the general range
preservation contract.

The local session publishes the two captured phases together, retaining the
actual before-selection and pending formats for Undo. Its final pending style
comes from native input planning at the selected logical start. The shared
adapter lowers the same plan into one additive `insert_general_paragraph_v1`
command in explicit general history; it never publishes an intermediate
selection or a root AST replacement. Original command tags and saved records
are unchanged. Older runtimes reject the new tag rather than reinterpret it.

The separate local `generalParagraphVersion()` and shared
`general_paragraph_version()` capabilities declare this behavior. General-mode
controllers route cross-block Enter, including browser-provided cross-block
targets, through the matching native command. Caption/code starts use one
general plain LF replacement instead of a structural split. Existing same-block
and collapsed-caret Enter, including empty-item exit, retain their original
routes. A missing structural capability refuses the requested cross-range split
without falling back to an original multi-step edit.

The [functional paragraph checkpoint](qualification/2026-10-16-general-paragraph-functional.json)
records the native matrices, controller contracts and actual release-Wasm
comparisons, including exact recovery and typing groups on both sides of Enter.

## Explicit caption/code text paste

The approved policy inserts the clipboard's text into a caption/code start and
reports formatting loss. `RichClipboardFragment::project_text_for_selection`
uses native general-range planning to resolve the logical start, including
backward ranges. An admitted flow/grid clipboard produces a bounded text/loss
report only for captions and code; prose returns no projection and keeps its
structured route. Inline clipboard fragments retain their existing contract.

The separate `clipboardTextPolicyVersion()` / `clipboard_text_policy_version()`
capability pairs with the native `projectClipboardText` / `project_clipboard_text`
read. Local reads use their frozen observation; shared reads reject stale or
foreign observations before parsing. Read-only projection is allowed but does
not authorize editing. The clipboard remains schema-bound and opaque to
JavaScript. Native reading order supplies quoted TSV for tables and alt/caption
text for images, never asset URLs or credentials. Empty textual content and
projections over 64 KiB reject instead of deleting the selected content.

The projection declares `breditor/rich-clipboard-text-projection` V1 with
`target`, `text` and deterministic `losses`: block structure, inline formatting,
block properties, table geometry and embedded content as applicable. This is a
read report, not a saved edit or a mutation token. Controllers submit one plain
replacement under the same publication guard, using the native destination's
input style. They show a formatting-loss status and invoke `onPasteLoss(report)`
only after success. Conversion/edit failures publish no successful-loss notice
and never retry with the external plain MIME payload. Vanilla and React adapters
expose the callback; React forwards the latest callback without reopening history.

The [caption/code functional checkpoint](qualification/2026-10-16-caption-code-text-paste-functional.json)
records actual paired release Wasm, directional targets, exact explicit/natural
recovery and future histories. It is not browser/OS clipboard acceptance.

## Remaining integration

The [transport V2 functional checkpoint](qualification/2026-10-16-writer-transport-v2-functional.json)
now covers explicit Wasm/SDK/reference-relay wiring, two offline authors, exact
general explicit/natural journal recovery after host restart, and peer-preserving
selective Undo/Redo. It does not change original writer digests or migrate rooms.

Whole-document selection,
remaining installed editing/transport acceptance and external interchange
remain required. Native IME/accessibility and
the historical WebKit reliability observations remain separate deferred
qualifications. The general-selections readiness row stays partial.

The [shared foundation qualification](qualification/2026-10-16-general-range-shared-foundation.json)
retains the original adapter's two refusal reproductions and earlier-runtime
recovery. The subsequent
[semantic history qualification](qualification/2026-10-16-general-range-shared-semantic.json)
records the explicit repairs, transport reproduction, exact new-family recovery
and unchanged original-mode compatibility. Neither checkpoint qualifies a new
browser editing request or promotes full V1 readiness.
