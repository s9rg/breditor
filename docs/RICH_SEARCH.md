# Native document search and replacement

Search and replacement belong to the Rust document owner. The browser presents
matches and submits guarded intentions; it does not flatten the editing DOM or
decide which text is replaced. The target is a complete local/shared workflow
with literal and regular-expression search, navigation, decorations, replacement,
atomic Replace All and exact recovered selective history. This work does not
freeze a V1 API or change existing document, journal or transport meanings.

Native query compilation, visible-domain traversal, complete match results,
source-bound navigation and local/shared replacement are implemented natively.
Separate Replace One and Replace All entry points stage complete semantic splice
plans and publish one history group. Shared replacement uses an explicitly
selected recovery family. Optional Wasm and programmatic SDK APIs now expose
owned results and exact persistent-session recovery. Borrowed vanilla/React
controls, out-of-tree decorations and separately named managed shared startup
now use the same guarded native operations through independently installed packages.

The [Wasm and SDK recovery checkpoint](qualification/2026-10-18-search-wasm-sdk-recovery.json)
pins the actual runtime binaries, tested source and 25 selected checks. It is not
the full candidate profile or release approval.
The subsequent [controls and installed integration checkpoint](qualification/2026-10-18-search-controls-installed.json)
pins 25 selected checks, independent public-package workflows and one successful
production-browser proof. Its source-verified reused runtimes do not qualify a
fresh official producer build.

## Search domains and order

Search reads the accepted immutable AST. Paragraphs, headings and code blocks
are individual text domains, including list/task heads, nested flows, table source
partitions and image captions. Formatting-run boundaries are transparent within
a domain; separate text blocks are not joined with invented separators. A newline
stored inside a domain remains real searchable text. Metadata, image alt text,
toolbar labels, unaccepted suggestions and hidden tables are not search domains.

Reading order follows the rendered semantic tree, not identity sorting. Tables
visit visible masters in row-major order and each master's ordered source cells.
Covered source bodies remain searchable exactly once; they are not discarded or
searched a second time as covered coordinates. No DOM coordinate is durable.

Read-only owners may search and navigate. Replacement must recheck the current
owner's write policy, even when a result was prepared while it was writable.
Future editable-region restrictions must feed the native domain policy before
they are advertised as supported by search.

## Matching and coordinates

The query explicitly chooses literal or regex mode, case sensitivity and whole
words. Literal input is never interpreted as regex syntax. Case-insensitive
matching uses Unicode simple case folding, not normalization or locale-specific
rewriting. Composed and decomposed text retain their original identities.

The case flag supplies the default regex syntax policy. Explicit regex inline
flags, such as `(?i:...)`, can override that policy within a pattern. Literal mode
has no inline syntax and always follows the supplied case flag.

Whole-word filtering uses the existing Unicode word-boundary implementation over
the original domain. It filters the selected leftmost-first, non-overlapping
matches; it does not reorder regex alternatives or silently rewrite a pattern.
Regex captures and anchors see the complete original domain when a search resumes
after a match. Backreferences and lookaround are not part of the native regex
language. Empty input is an inactive query; explicit zero-width regex matches
must advance at Unicode scalar boundaries without an infinite loop.

Results contain stable block IDs and scalar-aligned UTF-16 intervals. They retain
the exact source tree and schema/document binding. Results from a different or
changed tree must fail before replacement; checking the matched string alone is
insufficient. Search does not publish a selection, change pending formatting,
consume an ID, create Undo history or clear Redo.

Shared results bind one live owner, its applied and observed causal versions and
the exact source tree. UI-only changes may retain a result, but mutation still
requires the latest observation. New peer operations, Undo/Redo and a different
or restored owner invalidate it even when the visible AST is equal. An AST
result is not writer or account authority and cannot replace stale/read-only/lease
guards.

## Replacement and history

Replacement defaults to literal text. Capture expansion is a separate explicit
mode supporting `$0`, maximal numeric references such as `$12`, `${name}`,
`${12}` and `$$` for a literal dollar sign. Other dollar syntax, malformed braces,
unknown names and undeclared numbers fail even when the result has no matches.
Unmatched optional groups expand to empty text. The replacement inherits the
first matched scalar's formats; a zero-width hit uses the following run, the
previous run at end of text, or empty formats in an empty block. Code remains
unformatted. Byte-identical replacements retain every original run and do not
change the publication, pending formats, typing continuation or Redo.

`plan_rich_search_replace_one` and `plan_rich_search_replace_all` retain disjoint
original UTF-16 ranges and admitted text fragments. `RichSearchReplacePlan::preview`
assembles each changed text body once and rebuilds affected ancestors once, then
admits the complete final tree under the receiving schema and limits. It does not
publish or validate temporary grow-before-shrink states. The plan has private
fields and no unchecked constructor or decoder.

`RichLocalSession::replace_search_one` and `replace_search_all` check the exact
live publication, write policy and entire source AST before planning. They map
the actual directional selection through descending original splices using the
same checked boundary rule as ordinary text edits. Node, grid and document
selections retain their scope. A mapped caret retains its admitted pending
formats. Forward and inverse local branch recipes are replay-proved before one
publication and one explicit Undo group, separate from neighboring typing.

The existing local checkpoint families already support these exact branch
recipes. No query, capture template or new command is added to their serialized
history. The local candidate tree is not a shared mutation. Shared lowering targets
the matched original characters rather than replacing a whole text block or
publishing root JSON; foreign characters remain subject to selective-history rules.

Undo/Redo and exact reopen preserve the original before-selection and pending
formats. A search, stale result, oversized request or late failure leaves no part
of a replacement installed. Named versions and review decisions are separate
histories.

Recovery must record admitted semantic text edits and their source proofs, not
rerun a saved query against later text or different Unicode tables. A search
query is transient intent, not a deterministic document-history recipe.

## Shared replacement and recovery

`RichReplica::find_text_guarded` is read-only and needs no history upgrade.
Replacement requires `enable_search_history_guarded`, then
`replace_search_one_guarded` or `replace_search_all_guarded`. The explicit
upgrade retains the writer, accepted content, causal operations and Undo/Redo
stacks. It preserves independently selected original/general/document scope,
natural typing and reviewed-history policies in either enable order.

`search_checkpoint` and `SharedRichProfile::restore_search` use
`breditor/shared-search-session` format 1. Its scope selects a separate version-1
search journal, with explicit typing and reviewed-history choices. The envelope
also binds the original causal model and journal versions. Old checkpoint
encoders refuse search mode; old restore factories refuse the new records and
family names, even before the first replacement. No automatic family detection,
schema migration or journal reinterpretation occurs.

Each changed replacement records one source digest, ordered original text
intervals and expanded insertion text, with exact effects, history identity and
before/after UI. Replay re-admits semantic ranges through
`RichSearchReplacePlan::try_from_semantic_replacements`; it derives formats from
the proved source and never recompiles a saved query. This checked constructor
does not prove that a search was complete or grant mutation authority.

The staged owner performs descending source-character splices, verifies the
complete result and mapped actual selection against the native preview, and
checks update/save/resource bounds before publication. All 4,096 admitted hits
can belong to one semantic record and one selective Undo group; the ordinary
64-command batch limit is unchanged. A changed replacement is isolated from
adjacent typing. True identities, failed admission and reads retain Redo and any
open typing continuation.

Selective Undo preserves a peer's inserted text but does not promise its old
per-character interleaving inside a locally deleted chunk. As with ordinary range
replacement, restored local text can be contiguous beside that peer insertion.
Search follows the same deterministic causal placement and converges on both peers.

A certified fast path indexes a complete plain birth source once. It keeps the
same original character operations and provenance marks; formatted, fragmented,
hidden-source and empty-body reinsertion cases use ordinary logical lowering.
It does not copy unmatched characters, change causal formats or provide a
wall-clock performance guarantee. Installed-editor workflows exercise the same
native operations; browser and release qualification have separate gates.

## Wasm and programmatic SDK ownership

The optional local runtime declares `searchVersion() === "1"`; the application
shared runtime declares `search_version() === "1"`. SDK `supportsSearch()` checks
the complete matching capability rather than falling back to a JavaScript text
index. `findText(query, revision?)` returns an opaque owned result, with immutable
`metadata()`, native `navigate(active, direction, wrap)` and idempotent `dispose()`.
Metadata includes the schema/document binding, complete count and original block
intervals, not matched text, query text or captures. Its separate
`breditor/rich-search-results` format 1 uses canonical decimal strings for counts,
match indices and UTF-16 offsets, with the existing `sha256:` schema fingerprint.

`checkSearchResults`, `selectSearchMatch`, `replaceSearchOne` and
`replaceSearchAll` require that opaque result and a current owner observation.
Cloned metadata is not an edit credential. Native owner/source/causal checks are
independent of SDK branding. Navigation is allowed in read-only state and does
not clear Redo. Frozen metadata and pure navigation retain the original read;
publication must still validate the current source.

Each Wasm owner admits eight live result handles. A complete metadata read has a
4 MiB encoded ceiling; overflow fails rather than truncating. Dispose results
when a query is replaced or closed. SDK owner disposal releases every retained
result; independently retained frozen metadata remains readable. These bounds
do not change native document, action, history, relay or asset-store ceilings.

Shared reads and navigation need no history upgrade. A shared SDK owner must
explicitly select `{searchHistory:"search-v1"}` before replacement or recovery.
`restoreSharedSearchEditor(profile, room, checkpoint)` calls only the matching
native factory. Adopting a recovered search owner without the explicit option
fails. The original execute/dispatch unions, ABI defaults and old checkpoint
factories are not widened.

## Persistent search sessions

`SharedPersistentSession.openSearch` requires explicit grammar, history, range
and selection policies and a `restoreSearch` callback. It acquires the existing
exclusive causal writer lease before reading or restoring. Its separately
declared `breditor/shared-search-checkpoint-record` format 1 stores those policies
outside the opaque native checkpoint. A stored policy mismatch fails before the
restore callback. Old durable factories reject the new record and the search
factory rejects old records; neither rewrites them or imports a fresh AST as a
substitute for recovery. Migrating an existing durable key needs an explicit
future host workflow.

`SharedReviewPersistentSession.openSearch` atomically pairs the search source,
independent comment history, named version catalog and optional reviewed-history
identity and relay progress in `breditor/shared-search-review-checkpoint-record`
format 1. Comment/account and relay bindings remain explicit. A failed save or
close keeps readable recovery and the writer leases until a successful retry or
explicit discard. Saved bindings are not account credentials or live grants.
Local search uses the existing exact local checkpoint/store families.

The actual-Wasm functional checks cover 12 local and 36 shared SDK cases, 48
exact restores and 192 exact subsequent history comparisons. A separate matrix
uses synthetic IndexedDB/Web Locks for 18 document-only and 12 paired sessions,
73 exact reopens, 13 aborted writes, 18 corrupt native recoveries refused without
overwrite, retained versions and optional relay bindings. The matrices qualify
these programmatic contracts, not native browser storage, installed archives,
borrowed controls or a production deployment.

## Borrowed controls and managed startup

`mountSearchPanel(controlsHost, editor.search(), options)` is available from
`@breditor/editor`; the collaboration entry also exports `mountSharedSearchPanel`.
The controls host must be separate from the canonical editing surface in the
same document. `BreditorSearchPanel` from either React entry borrows the same
port. Neither control creates, closes or replaces a document owner or writer.
Ordinary rerenders retain drafts; a different owner or React `sessionKey`
creates a new panel. Closing and reopening preserve query/replacement drafts.
Dispose the panel before closing its owner.

The panel supports literal/regex queries, case/whole-word switches, wrapping,
Previous/Next, literal/capture replacement and Replace One/All. Rust owns the
complete result and navigation. Controls submit named asynchronous operations
through the existing DOM command coordinator, not the old serialized command
union. Each queued operation retains its opaque result, detached replacement
input and original revision. Accepted composition, intervening source changes,
policy changes, disposal and queue exhaustion reject stale work rather than
rerunning a query or silently moving the replacement. Editor and query-field
composition disable panel actions. Read-only notifications cannot publish
reentrantly; a display callback failure cannot rewind an accepted native edit.

Decorations map admitted block IDs and UTF-16 intervals into transient DOM
ranges. They are painted outside the editable DOM, never inserted as text or
formatting. Freshness is checked before paint; composition, busy/closed owners
and stale results clear it. Scroll, resize, surface mutation, and fullscreen
transitions update paint. The layer follows a fullscreen editor ancestor and
returns to the document body on exit.
Only visible rectangles are painted, with a separate 8,192-rectangle cap and an
explicit clipping notice. This presentation bound does not truncate native
results or Replace All. Navigation keeps control focus; closing returns focus
to the editor without authoring content.

Local managed openings expose search without changing local save families.
Shared replacement uses `openSharedSearchEditor` or
`openSharedDocumentSearchEditor` from `@breditor/editor/collaboration`.
Both require explicit language and history choices; the former also requires an
explicit range policy, and the latter requires document selection. First-opening
checkpoint seeds use only `{kind: 'searchCheckpoint', checkpointJson}`.
Stored records still take precedence, and `{kind: 'resume'}` requires exact
recovery. Old openings and keys do not implicitly upgrade to search records.
Recovery handles expose `searchHistoryPolicy()` alongside their existing policy
metadata; failed closure retains the exact owner and lease for retry.
An independent durable key does not make a checkpoint safe to clone: never
duplicate a live causal writer. New documents need fresh room/writer identities;
migration needs explicit writer retirement and exact-history recovery.

`BreditorSharedSearchEditor` and `BreditorSharedDocumentSearchEditor` select those
factories immutably. Existing StrictMode, cancellation, old-writer retirement and
failed-close recovery contracts remain shared with the original wrappers. The
old components and checkpoint tags retain their meanings. Review-aware durable
sessions continue to use the explicit paired persistent factory; a document-only
managed opening does not silently enable or persist review metadata.

## Resource admission and integration

Pattern size, compiled NFA/lazy-DFA cache memory, visited or queued AST nodes,
domain bytes, match count,
engine search volume and aggregate replacement bytes have explicit native
limits. A complete result or an explicit error is returned; Replace All never
operates on a silently truncated prefix. Existing transaction/history limits
remain in force. These structural bounds are not a measured wall-clock guarantee
or an approved V1 performance envelope.

The current search ceilings are 1,024 UTF-8 query bytes, 4 MiB of visited body
text, 65,536 visited/queued nodes, 8,192 text domains and 4,096 complete matches.
Regex compilation admits at most 65 capture slots including group zero, a 1 MiB
NFA and a 256 KiB lazy-DFA cache. Repeated engine calls are charged for their
remaining haystack bytes plus one unit per call, with a 64 MiB total. Exact
case-sensitive literal search instead uses linear substring iteration. These
bounds do not claim a total-heap limit or a measured CPU deadline.

Replacement input is limited to 64 KiB of UTF-8 and capture templates to 1,024
parts. Changed insertions across a complete plan are limited to 1 MiB before
expanded text is allocated. Exact identity expansion can retain a larger original
match without allocating an insertion. A plan is one native compound operation;
a zero-operation host transaction policy rejects a changed plan. These bounds do
not widen ordinary action batches, shared command batches, document admission,
retained history capacity or checkpoint byte limits.

An older runtime refuses the optional controls before mutating their host,
without altering ordinary editing. Public package probes cover the borrowed
controls and root/React startup with actual paired Wasm, exact reopens and future
Undo/Redo. Independent offline archives retain producer-locked registry artifacts,
strict consumer types and local/shared/React bundle isolation. Mixed merged-table
and caption workflows preserve peer edits, independent comments and named versions.

Acceptance requires native Unicode/formatting/merged-table fixtures, both local
and shared ownership, literal and regex/capture replacement, zero-width progress,
one-step Undo/Redo, exact reopen and peer-preserving offline/concurrent workflows
through installed packages. One headless Chromium production-bundle check also
checks actual geometry, source-DOM isolation, live refresh, readonly navigation
and one-step replacement Undo using browser IndexedDB and Web Locks. It is not
physical input/clipboard, cross-browser, historical WebKit, performance or V1
qualification. Those remain tracked in the release plan.
