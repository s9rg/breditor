# Rich document review contract

The next functional milestone adds threaded comments, proposed changes and named
document versions to the existing Rust-owned rich editor. These are opt-in review
features, not replacements for the canonical AST, ordinary edit history or writer
transport. Existing constructors and saved protocol families keep their meanings.

## Accepted content and proposed changes

The owner selected an unchanged accepted document until a suggestion is accepted.
Pending proposals carry an attributed native intent, source witness and native
preview. They do not mutate accepted text, tables, images, selection or document
history. Rejecting a pending proposal cannot delete accepted content.

Accept must validate both the current proposal state and its document targets in
one native staged transaction. Changed targets produce an explicit conflict or
require a fresh preview; they must not trigger an unconditional snapshot overwrite.
Text, formatting, list/table structure and image properties use original native
actions, with explicit unsupported cases rather than hidden plain-text fallbacks.
Concurrent Accept/Reject and repeated Accept require an explicit convergence and
idempotency contract before their shared mutation path is implemented.

## Durable comments and anchors

A thread has a durable identity, author, original anchor, messages and resolution
state. Replies and message edits retain attribution. Comments have an independent
history lane: document Undo must not remove somebody else's reply, and comment
Undo must not undo typing. Hosts supply authenticated principal/role policy;
author strings and causal writer identifiers in content are not permissions.

The first native component is a separate `breditor/shared-review-anchor` V1
envelope. It binds document identity, schema fingerprint, causal model and engine,
and retains captured causal dependencies and native character/container anchors.
It carries no account claim, credential or expiry. Capture and resolve are pure,
including in read-only mode, and cannot change editor selection or history.

Resolution has three outcomes: resolved, pending document dependencies, or
orphaned. Text follows native character affinity through insertion, paragraph
split/join and moves. A formerly nonempty range that collapses is orphaned.
Boundary-affine replacement within a retained text flow can remain in the range;
the review UI must distinguish the original quote from current content. Comments
never borrow the editor caret's fallback to another cell or neighboring row.
Grid anchors retain their original table/row/column identities; removing a
boundary axis or hiding its table orphans the anchor instead of choosing a new
axis. Node anchors require the same surviving node. A document-wide anchor is an
explicit global discussion, not a range between the first and last paragraphs.

Orphaned threads remain readable and retain their immutable anchor for possible
reattachment through restored structure. Reanchoring is an explicit attributed
review action. Existing ephemeral presence packets retain their original format,
expiry and relocation laws; durable anchors are not renamed presence packets.
Anchor inputs are bounded to 256 KiB, 1,024 causal clocks and 1,024 captured text
cut witnesses. Invalid bindings, malformed cursors and stale captures reject.

## Named versions

A version is a named immutable admitted document snapshot with author, source
revision/causal identity, creation metadata and retained asset references. It is
not an old live writer credential or a synonym for a runtime Undo checkpoint.
Comparison is a native semantic read over admitted trees. It reports text,
formatting, structure and immutable asset-reference differences without embedding
browser DOM or fetching external assets.

Restore creates a newly authored guarded edit against the user's observed current
document, with a fresh namespace and an explicit preview. It never rewinds a live
writer, imports old credentials or silently replaces concurrent unobserved work.
Current discussions remain current discussions; restoring a document version does
not silently resurrect an older review database.

## Implementation and acceptance order

1. Native durable anchor capture, strict mapping, orphan/pending behavior and exact
   saved-anchor resolution after future edits and native journal recovery.
2. Bounded native thread/message actions, author policy, independent review history
   and a separately declared recovery/merge contract.
3. Native immutable versions, semantic comparison and guarded restore planning.
4. Native proposal creation and preview, then atomic accepted edits and explicit
   concurrent decision rules across text, formatting, lists, tables and images.
5. Paired opt-in Wasm, SDK, vanilla/React controls and review persistence/transport.
6. Clean-installed mixed workflows with two offline authors, comments on changing
   targets, conflicting reviews, exact reload, selective history and image bytes.

Every new Rust action has its own named documented file. Tests accompany native
and integration increments. Broad browser matrices, physical input/accessibility,
performance and final V1 qualification follow this functional phase. A native
foundation alone does not complete any of the three review-product features.

## Native and SDK checkpoint — October 16, 2026

Implemented foundations, not a release-complete review product:

- Durable anchors and real-document comment admission, including native validation
  of every retained anchor on recovery and newly admitted remote anchors.
- Attributed thread creation, replies, edits/retractions, resolve/reopen, explicit
  reanchor and independent author-local Undo/Redo. Concurrent bodies and anchor
  values remain visible; opposing resolution heads are explicitly conflicted.
- An immutable owned review stream with exact decimal event counters, causal
  dependencies and a hash-linked prefix. The hash detects divergent prefixes; it
  is **not** authentication. Hosts supply writer/account/rights separately. Saved
  roles are absent and live grants are reapplied on restore. Historical catchup
  still needs authenticated original grants, not a payload permission claim.
- Named content-addressed semantic versions, native stable-identity block/text/
  format/property/asset comparison, and opaque guarded restore plans. Restore
  creates fresh owned nodes in one ordinary edit group and keeps current comments.
  Exact future document and review history survives paired manual recovery.
- Complete optional Wasm/typed SDK pairing. Old document protocols and constructor
  defaults are unchanged; native version proofs have no public constructor. SDK
  callbacks cannot author reentrantly, and each receives a fresh read projection.

The actual-Wasm probe is reproducible with:

```sh
CARGO_INCREMENTAL=0 node scripts/build-collaboration-runtime.mjs
node_modules/.bin/tsc -p packages/breditor-collaboration/tsconfig.json
node scripts/probe-review-sdk.mjs packages/breditor-collaboration/dist/runtime
```

It combines peer comments, delayed document dependencies, version restores,
orphaned targets, both selection policies and both edit-history policies. The
checkpoint passes four exact paired restores and 24 future paired checkpoints.
This is a programmatic Wasm/SDK test, not an installed browser/relay qualification.

### Current bounds and unfinished integration

Review metadata retains at most 8,192 events and a 16 MiB exact checkpoint. Frames
are at most 1 MiB/128 events; messages are plain text, nonblank and at most 16 KiB.
Every Undo/Redo visibility operation consumes an event. No automatic compaction or
history eviction is implemented. Large-history throughput remains unqualified.

Version envelopes are at most 4 MiB, even where the admitted document itself has
a larger budget. Comparison is block/identity based, not a word-level visual diff
or heuristic match between newly allocated nodes. Restore uses existing semantic
copy/paste laws: active merge geometry and independent source-cell bodies survive,
but inactive merge/retraction provenance is not resurrected. Image identities and
binding generations are fresh; immutable assets remain host-resolved. The host
must retain/fetch referenced bytes. Nothing embeds or uploads those bytes.

Restore currently uses the existing 64-step and 64-flow-block limits (one paste
plus observed root deletions, hence at most 63 existing root blocks). Intermediate
staged admission may also refuse a replacement near document budgets. Preview
failure is atomic; it does not silently truncate content or fall back to text.
Restore clears local selection/pending styles as shown by its native preview.

The explicit `SharedReviewPersistentSession` now stores both exact histories and
a local immutable version catalog in one IndexedDB record/transaction. It leases
document and review writers independently before calling either native factory,
requires exact declared language/selection/range/history policies, and reapplies
fresh host access on restore. The storage header is identity/budget admission,
not a replacement for native causal replay. Old records require an explicit future
migration; neither reader silently resets or downgrades the other's family.

An aborted save retains the previous complete durable pair. Failed final saves
retire authoring but retain both readable native histories and both leases until
retry or explicit discard. `exportRecovery()` returns the complete readable pair
and catalog without serializing live permissions. The local catalog is bounded
to 32 packets; the entire escaped stored record is bounded to 32 MiB. No automatic
version deletion, migration or asset-byte retention policy is inferred.

The paired lifecycle passes actual-Wasm tests using synthetic IndexedDB/Web Locks:
12 exact reopens, four retained catalogs, four atomic-abort checks, 12 lease checks
and four native corrupt-recovery refusals. This does not qualify physical browser
storage or server-side writer leasing. The existing document-only wrapper still
explicitly refuses live comments, so it cannot claim a document-only save while
silently omitting discussions.

Authenticated review relay receipts/historical grants, a shared version catalog,
vanilla/React review controls and clean-installed mixed acceptance remain
unfinished. Original-quote capture/presentation also remains review UI work.

Suggestions and atomic shared Accept/Reject are not implemented yet. Accepted
content remains unchanged until an authenticated Accept is finalized. The
concurrent/offline decision ordering is a separate pending contract choice.
