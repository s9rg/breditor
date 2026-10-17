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
The owner approved a single authenticated server decision order for concurrent
Accept/Reject. Offline review decisions stay queued until reconnect; ordinary
offline document edits and comments continue to merge. A suggestion is finalized
once, and a repeated decision returns its original result rather than inserting
the accepted change again. A stale Accept must report a target conflict without
mutating accepted content. The eventual accepted edit and final decision must
share one durable transaction and a recoverable native publication. This decision
contract is selected; suggestions and their mutation path are not implemented yet.

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

### Vanilla and React controls

`mountSharedReviewPanel` borrows an enabled native review facade. It provides
explicit document/selection targets, replies, attributed concurrent message
versions, guarded message edits, retraction, resolution, reanchoring and separate
comment Undo/Redo. Stable keyed controls retain unsaved reply/edit drafts through
native updates. A changed edit baseline requires explicit acknowledgement before
saving the retained draft. Comment content is plain text, never interpreted HTML.
The host's policy callback controls display affordances only; native permissions
still decide every action.

An optional paired-session catalog adds named version capture, semantic comparison,
the exact native restore preview and explicit Apply. A changed source publication
disposes the preview. Failed local persistence offers Retry without recapturing a
duplicate version. Hosts supply permanently fresh restore prefixes and asset-byte
retention. These controls do not authenticate transport or restore inactive causal
merge provenance.

`BreditorSharedReviewPanel` is available from the optional React collaboration
entry. Its `initialOptions` belong to one core/`sessionKey`; parent rerenders retain
drafts. Both DOM and React mounts dispose only their own controls, never either
native writer or persistence lease. The caller closes the paired session after
unmounting borrowed controls.

SDK review guards now include an exact facade-lifetime object witness as well as
both revisions. Matching revision strings from another owner, or a guard copied
through JSON, cannot authorize a queued request. This is a source-state guard,
not an account credential. Store declared native recovery records, not UI guards.

The native reference host now has opt-in authenticated comment transport, described
below. An automatic review SDK sync adapter and atomic paired storage of catchup
progress remain unfinished, along with a shared version catalog and clean-installed
mixed acceptance. Original-quote capture/presentation also remains review UI work.
Current control tests use actual Wasm with synthetic DOM, IndexedDB and Web Locks;
physical browser qualification remains a later release phase.

### Authenticated comment transport

`Room::enable_review` explicitly activates a review V1 lane. Default rooms and
document writer transport keep their original behavior. New activation, grants,
metadata-writer registrations and acceptances use separately tagged records in
the same private durable log as document edits. Older hosts cannot read these new
records; no silent downgrade or migration is supplied.

Comment and Moderator roles are independent of document Reader/Editor. Every
metadata actor is bound to an authenticated account, a separately saved hashed
resume credential and a replaceable connection lease. Account/read-role and
review-role changes fence old metadata leases; restart invalidates all leases.
The reserved server metadata actor cannot be registered by a client. Historical
catchup retains the original server-verified grant, and recovery independently
rederives it from the preceding durable grant records. Content claims never grant
authority. Comment-only users can reserve observation-only document identities
from the same allocation registry as editors. Those identities cannot submit
document edits, even if the account later becomes an Editor.

Native metadata preparation is pure and checks both exact owners, a contiguous
single-actor batch, source identity/rights, every newly admitted native anchor and
captured document dependencies. The host appends and syncs acceptance before
publishing the candidate or returning a receipt. Missing review or document edits
remain client-owned pending input: no prefix is published or acknowledged. Native
clients may still retain valid pending targets during catchup; this is distinct
from server admission of a comment based on unaccepted document work.

Review receipts use positive **inclusive** event counters, unlike the existing
document operation windows. Native canonical prefix/batch digests ignore outer
JSON formatting but preserve exact opaque anchor-string bytes. An overlapping
batch retains the original acceptance of each known event. A fully known retry
or repacking returns the terminal supplied event's original durable sequence and
appends nothing. Hashes witness lineage, not authentication.

Catchup uses ordered pages of at most 4 MiB including JSON escaping, not an
unbounded metadata checkpoint in a socket message. Each cursor is pinned to a
random durable review-log binding, so an identically seeded separate room cannot
reuse it. Clients must persist applied document/review state before advancing
the cursor. The existing 1 MiB/128-event input and 16 MiB/8,192-event native limits
still apply. The reference log also retains its 256 MiB/4,096-record ceiling and
has no compaction. Actor registrations are capped at 1,023 plus the reserved
receiver; failed/timed-out first registrations can consume an actor reservation.

The socket capability `reviewV1` must be requested explicitly. It enables separate
review registration/resume/submission, clock, grant and paginated sync requests,
plus coalesced `reviewChanged` hints. Clients that did not negotiate it receive
neither a review descriptor nor this event family. The standalone
`review_functional` host creates only an isolated loopback test room.

Reproduce the focused transport checks:

```sh
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/relay-native \
  cargo test --manifest-path experiments/relay/Cargo.toml --release --features server --locked --offline
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/relay-native \
  cargo build --manifest-path experiments/relay/Cargo.toml --release --features server --example review_functional --locked --offline
node scripts/probe-review-relay.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

The actual-Wasm/socket fixture passes both original explicit and document natural
history: six exact paired restores, eight future history steps, 16 durable review
receipts, four pending-dependency responses, moderation under historical grants,
guarded version restore preserving comments, and permission/capability refusals.
It explicitly drives wire requests and manual checkpoint persistence. Automatic
review SDK reconnect/retry, paired IndexedDB cursor persistence and clean-installed
review acceptance remain subsequent functional work. Public deployment still
needs the existing resource-limited import, identity/TLS and storage-lifecycle
qualification; this loopback host does not establish production readiness.
