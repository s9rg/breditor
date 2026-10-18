# Native document search and replacement

Search and replacement belong to the Rust document owner. The browser presents
matches and submits guarded intentions; it does not flatten the editing DOM or
decide which text is replaced. The target is a complete local/shared workflow
with literal and regular-expression search, navigation, decorations, replacement,
atomic Replace All and exact recovered selective history. This work does not
freeze a V1 API or change existing document, journal or transport meanings.

Native query compilation, visible-domain traversal, complete match results,
source-bound navigation and local replacement are implemented. Separate Replace
One and Replace All entry points stage complete semantic splice plans and publish
one local history group. Wasm/SDK exposure, controls, decorations and shared
execution/recovery remain active work.

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

Shared execution must also bind the live causal observation, including peer
publications that leave the visible AST equal. An AST result is not writer or
account authority, and cannot replace the owner's stale/read-only/lease guards.

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
history. The local candidate tree is not a shared mutation. Shared lowering must
target the matched original characters rather than replace a whole text block or
publish root JSON; foreign characters remain subject to selective-history rules.

Undo/Redo and exact reopen preserve the original before-selection and pending
formats. A search, stale result, oversized request or late failure leaves no part
of a replacement installed. Shared history still needs a carrier supporting the
complete bounded group. If an existing carrier cannot express it without changing
meaning, use an explicitly selected family rather than adding unknown persisted
commands to an old journal version. Named versions and review decisions are
separate histories.

Recovery must record admitted semantic text edits and their source proofs, not
rerun a saved query against later text or different Unicode tables. A search
query is transient intent, not a deterministic document-history recipe.

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

Local/shared Wasm capabilities, SDK results, borrowed vanilla/React controls and
decorations must be paired explicitly. An older runtime refuses the optional
feature without altering ordinary editing. Closing the search UI must preserve
the editor, drafts and history; asynchronous or stale view results cannot publish
an edit. Search presentation must remain separate from canonical editing DOM.

Acceptance requires native Unicode/formatting/merged-table fixtures, both local
and shared ownership, literal and regex/capture replacement, zero-width progress,
one-step Undo/Redo, exact reopen and peer-preserving offline/concurrent workflows
through installed packages. Performance, supported-browser/input and final V1
qualification remain tracked in the release plan.
