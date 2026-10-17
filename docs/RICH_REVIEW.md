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

The native reference host now has opt-in authenticated comment transport and the
SDK has an automatic paired-storage adapter, described below. A shared version
catalog and clean-installed mixed acceptance remain unfinished. Original quotes
now have a native historical read and optional lazy control, described below.
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
It explicitly drives wire requests and manual checkpoint persistence. The SDK
checkpoint below adds automatic synchronization and paired progress. Public deployment still
needs the existing resource-limited import, identity/TLS and storage-lifecycle
qualification; this loopback host does not establish production readiness.

### Automatic review synchronization

`registerSharedReviewWriter` and `SharedReviewRelaySync` are exported from the
optional collaboration entry, including `@breditor/editor/collaboration`. The
registration helper waits for the host's separate credential save before returning
an author identity. It can use an already reserved editor document writer or
reserve a permanent observation-only document writer for a comment-only account.
Failed registration saves can consume reservations; they never silently rename
unsent events or replace an existing actor's credential.

The adapter borrows one `SharedReviewPersistentSession` and its exact core. It
submits metadata only, so an existing document relay can run beside it without
giving comment-only users document-edit authority. It receives document catchup
too, verifies document-writer lineage before importing it, and retries pending
comments when their document dependencies reach the server. An optional
`flushDocument` callback adds a host-selected document-save barrier. Disposal stops
networking, not either native owner or persistence lease; dispose networking before
closing the borrowed session.

Native `review_transport_version` capability 1 supplies exact local/historical
clocks, receipts for already-retained batches and export through a captured event
end. Older comment runtimes still support their original review API but cannot
simulate these transport proofs in JavaScript. Unknown own-writer suffixes,
divergent prefixes, mismatched receipts and server rollback stop sync and retain
local recovery. Outbound native frames are saved locally before submission. A
flush uses its captured review end, excluding later review actions from that
batch. Requests, flush waiters, socket bytes and retry delays remain bounded.

The additional socket capability `reviewLineageV1` explicitly selects current-role
responses and a native cursor-prefix proof. It requires `reviewV1`; original
`reviewV1` clients keep their original authenticated/catchup response shapes and
cannot call the new proof request. Historical source grants remain independent
of current permissions. A revoked comment writer does not automatically steal its
lease back; an explicit reconnect can retain read-only catchup when document-read
permission remains. Author registration needs Comment/Moderator access. A new
reader can instead register the permanent observer identity described below,
without any temporary write grant.

Setting `SharedReviewSessionOptions.relay` selects the distinct
`breditor/shared-review-relay-checkpoint-record` V1 storage family. It holds both
exact native journals, the local immutable version catalog, nonsecret relay
binding, catchup cursor and native accepted prefix in one IndexedDB transaction.
Credentials and live roles are excluded. Neither local-only paired V1 nor old
document-only readers are silently upgraded or allowed to omit this progress.
The unchanged 32 MiB escaped record ceiling includes the new fields.

The durable progress getter changes only after transaction completion. An aborted
save retains the preceding complete record and cursor, while both in-memory
native histories remain readable for retry/export. Recovery/export objects do not
expose mutable internal binding objects. Before using a restored cursor to skip
pages, the adapter checks every server prefix through that sequence against the
actual restored Rust sidecar. A valid but incomplete sidecar cannot silently skip
missing peer discussions just because its cursor looks well formed. Restore
never resets metadata or manufactures missing local author history.

Reproduce automatic integration with the matching runtime and host:

```sh
CARGO_INCREMENTAL=0 node scripts/build-collaboration-runtime.mjs
node_modules/.bin/tsc -p packages/breditor-collaboration/tsconfig.json
node scripts/probe-review-relay-sdk.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

The actual-Wasm SDK probe covers both selection/history policies: twelve exact
paired reopens, four abrupt host restarts with automatic reconnect, four atomic
save failures/retries, four missing-native-prefix refusals, sixteen future history
steps, four guarded version restores, multi-page escaped catchup and four
write-to-read-only transitions. IndexedDB and Web Locks are synthetic. Clean-installed
review/UI acceptance, authenticated shared
versions and suggestions remain part of the active goal.

### Permanent read-only metadata observers

`registerSharedReviewObserver` reserves a metadata actor for an account with
document-read permission only. By default it also reserves the existing permanent
document-observer identity. Its identity has `reviewEditing: "read_only"`; this is
a fixed actor kind, not a saved live permission. The host still supplies the native
document read-only policy and `review.access: "read_only"` when opening the paired
session. Passing an already reserved document writer remains an explicit host
choice and does not change that writer's separate permissions.

Observers and authors share the bounded actor registry, so the same actor cannot
be registered under both kinds. The distinct durable `RegisterReviewObserverV1`
record never becomes an author record, including after role promotion or restart.
Author resume/submission rejects observer actors even when their account is now
Editor/Moderator. Becoming an author requires a separate newly registered actor.
The `reviewObserverV1` socket capability requires `reviewLineageV1` and `reviewV1`;
old capability/response shapes remain unchanged. Observer credentials can only
resume a matching principal's read-only lease. Replacement fences the prior
connection; read revocation denies catchup, and regrant requires valid resume.

The explicit observer identity selects
`breditor/shared-review-observer-checkpoint-record` V1, not the writer or local
paired storage family. One transaction retains both exact native journals, the
local version catalog, nonsecret binding and caught-up prefix. The unchanged
32 MiB record budget includes all fields. An observer has no authored sequence,
and its native own-event counter must remain zero. Native restore refuses even a
structurally valid recovery record containing an authored observer suffix; failed
admission leaves the saved bytes available. There is no silent promotion,
demotion, actor renaming or family migration. Credentials and current account
roles remain outside portable recovery. A failed save retains the prior complete
record and cursor, with readable in-memory recovery for explicit retry.

Reproduce the additional actual-Wasm/native acceptance after building the matching
SDK and isolated host above:

```sh
node scripts/probe-review-observer-sdk.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

Four selection/history combinations cover initial reader catchup without write
grants, exact reopen, refused authored recovery, failed-save retry, permanently
read-only policy after promotion, lease replacement, read revoke/regrant and
abrupt host restart. IndexedDB and Web Locks remain fixtures, not physical browser
qualification. This completes initial pure-reader integration, not the remaining
shared version catalog, suggestions or combined installed review
acceptance.

### Original quotes and proven version sources

The native `read_review_quote` action reads the selected content at the anchor's
captured causal cut, not today's content at old numeric offsets. A historical
engine fork retains only that cut's operations; it is never checked out on the
live owner, authored, published or saved as a second replica. The original
canonical Rust materializer/schema and semantic selection/clipboard laws supply
the quote. Current document selection, pending formats, observation tokens and
both history lanes remain unchanged, including for read-only owners.

Quote results are explicit: `quoted` with complete plain text, `pending` while
document operations are missing, `document` for a global discussion with no
selected text, or `unavailable` when text exceeds 64 KiB UTF-8. A caret quotes the
empty string. Deleted or changed current targets can still quote their original
text; table columns retain tabs and rows retain newlines, and unselected text is not
included. Malformed bindings, non-causally-closed clocks and a target invalid at
the claimed capture cut reject instead of quoting a guessed neighbor. The
existing 256 KiB anchor/1,024-clock and native document budgets still apply.
Historical reads require retained native history; no compaction policy is added.

`verify_document_version_source` separately proves that a version's entire
canonical semantic snapshot equals the actual document at its captured source
cut. It returns validated descriptive version metadata and numerically sorted
exclusive document-operation ends, or explicit missing dependencies. A valid
digest alone is insufficient: a caller can rehash different admitted content
while claiming an older source. The original `read_document_version` still admits
such imported descriptive packets under its original contract; only the new
proof establishes historical content equality. Neither read authenticates an
author, checks a server's accepted semantic-group boundaries or acknowledges
durable publication. Those remain required laws of the unfinished shared catalog.

The additional native capability pairs `review_quote_version`/`read_review_quote`
and `document_version_source_version`/`verify_document_version_source` are version
1. SDK `supportsReviewQuotes`/`readReviewQuote` and
`supportsVersionSourceProofs`/`verifyVersionSource` refuse incomplete native pairs;
older runtimes retain their original comment and imported-version support.
No existing anchor, review frame, version envelope, view or saved journal gains
new fields or meanings. The application still exports its same six JS factories
and proof types, with no research constructors.

The borrowed vanilla and React review panels expose **Show original quotes**.
They read lazily and cache completed display text only for active immutable anchor
packets. Ordinary typing, peer replies and rerendering do not reconstruct every
discussion's old document. Pending quotes require an explicit retry after catchup.
Display uses literal text, never markup, and remains distinct from current target
status. Existing borrowed host panel ports without quote methods still mount with
the new control disabled.

The focused Rust contracts and `probe-review-sdk.mjs` cover old revisions,
deleted/split Unicode ranges, exact future recovery, table/image properties,
cross-cell selected text, missing history, refused noncausal cuts and rehashed
source/content mismatches. `probe-review-controls-sdk.mjs` verifies lazy quote
display and retention through version restore with actual Wasm and fixture DOM.
These close original-quote functionality, not the authenticated shared catalog,
suggestions or final combined installed acceptance.
