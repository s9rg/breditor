# Native general range replacement contract

General text replacement now has a Rust plan and local session action. It
preserves partially selected tables, images and structural owners rather than
flattening them. The owner approved this policy: remove only selected content
inside partial structures, remove whole enclosed atoms, and insert replacement
text at the selection's logical beginning.

The local foundation is implemented and the initial shared adapter is partial.
Complete shared lowering, Wasm editing commands, SDK input routing,
document-wide Select All and installed-browser acceptance remain required
before the general-selection feature is ready.

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
preview and retain existing command/resource ceilings. Required fresh paragraph
births cannot justify a root replacement or an invalid intermediate cell/item.
Sequential admission and transient resource requirements need explicit tests.

Wasm and SDK integration need an explicit capability and closed guarded
requests. Browser controllers must use native plans, not infer removal from DOM
order. Existing cross-cell drag still produces a Grid selection. General
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

## Shared integration gaps

Two deterministic cases still prevent general support. The tests reproduce
atomic refusal; a passing refusal test is not acceptance of the feature.

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

Both cases must work before advertising a general-range Wasm/SDK capability.
The complete shared implementation needs an explicit saved semantic contract
that prepares retained origins and applies causal changes before final
admission. It must not change old journal command meanings, raise resource
ceilings, invent temporary user blocks or replace the shared AST wholesale.
Exact replay and old-reader refusal must be proved for any new saved family;
unchanged peer-frame interpretation needs its own interoperability proof.

General first-key typing groups, clipboard routing and whole-document selection
remain required integration work. Native IME/accessibility and the historical
WebKit reliability observations remain separate deferred qualifications.

The [shared foundation qualification](qualification/2026-10-16-general-range-shared-foundation.json)
records all 331 canonical shared tests, the ten same-source research cases,
strict native/optimized-Wasm lint, Rustdoc, default JavaScript/type checks and
actual earlier-runtime recovery. Two of the ten new tests deliberately
reproduce the required unresolved cases above; neither is a feature acceptance.
