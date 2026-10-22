# Breditor collaboration application candidate

Optional shared editing for the original Breditor rich editor. This private
`0.3.0-alpha.22` package contains the browser coordinators and their matching
application-only Rust/Wasm module. It has no dependency on the experimental
probe package and does not require a relay for local editing.

Use `@breditor/editor/collaboration` for lazy initialization and the default
standard profile, or use this lower-level package with an explicitly selected
original shared V1 configuration or the separate structural V2 factories below.
Install the exact matching candidate archives;
there is no registry release or V1 API freeze yet.

```js
import init, * as wasm from '@breditor/collaboration/wasm';
import {compileStandardSharedProfileV1} from '@breditor/collaboration';

await init();
const profile = compileStandardSharedProfileV1(wasm, {
  format: 'breditor/shared-rich-profile', formatVersion: 1,
  schema: {name: 'example/shared-editor', version: 1}, extensions: []
});
// Acquire the exclusive writer lease before using profile.create/join_frame/restore.
// Transfer each returned writer to SharedRichEditor or SharedPersistentSession.
// Free the profile after those callbacks finish; writers retain their codec.
```

Use a bundler that supports generated `new URL` Wasm assets. Node consumers may
initialize with bytes from the `./wasm-binary` export. Ordinary package-root
types compile with `ES2022,DOM`; advanced generated-binding types additionally
use `ESNext.Disposable`.

## Exact session archives

Sessions own their native cores and writer leases. Close the session for a final
save; use explicit `discardAndClose()` to abandon unsaved memory. If a borrowed
core was disposed prematurely, final save still rejects, but explicit discard
releases the actual leases after in-flight storage settles without rewriting
committed histories. Retained status clocks are not live native proof. See
[owned core lifetime](../../docs/OWNED_CORE_LIFETIME.md).

Local sessions that independently select document/comment history can use
`captureSharedIndependentSource` and `captureSharedIndependentParticipant`.
The separate portable participant family preserves both exact native lanes,
local versions, selected raster bytes and complete upload state. It requires
current host authority for capture and explicit native replay/current permissions
for recovery; it does not activate a room or relabel old archive families. See
[the independent participant contract](../../docs/INDEPENDENT_PARTICIPANT_BACKUP.md).

`SharedPersistentSession.exportBackup()` captures exact native history, including
Redo, without a save or publication. Paired `SharedReviewPersistentSession`
archives also retain comments, local version packets and selected nonsecret
review progress. Restore through the separately named `restoreBackup`,
`restoreDocumentBackup`, `restoreReviewedBackup` or `restoreSearchBackup` factory,
with explicit source policies, matching native replay and host-reacquired writer
authority. Only absent durable keys can be inserted; existing records never get
overwritten. SHA-256 checks corruption, not provenance or permissions. These
archives exclude assets, credentials, separate offline outboxes and server logs;
they do not implement rotation. See [the shared backup contract](../../docs/SHARED_SESSION_BACKUPS.md)
for exact families, limits and failed-close recovery. The default package has a
different backup format; managed editor startup is not silently redirected.

Ordinary closed live candidates now fork the actual native document and history
without replaying the Breditor semantic journal. Cold recovery remains complete
semantic replay, and original natural typing-group reopening retains that path.
Pending causal inputs, native Undo/Redo and failure isolation remain required;
native copying and validation still scale with retained state. See the
[live staging contract](../../docs/LIVE_HISTORY_STAGING.md). No format or default
changes, history truncation or resource-envelope promotion is implied.

## Dependent offline backups

The proposal queue, revision outbox and public version catalog now also expose
`exportBackup({signal?})` and static `restoreBackup(options)`. Restore first requires
the matching native source and explicit `writerRecovery: 'host-reacquired'`, then
inserts the exact dependent record only if its destination key is absent. It
preserves queued/stopped intent and retained receipts/conflicts without connecting
or finalizing a decision. Version/revision restore rejects automatic connection/
start; the host reconciles authority and server state before explicitly connecting.
Capture/close revisions before their borrowed queue/session. See the
[dependent-store backup contract](../../docs/RETAINED_STORE_BACKUPS.md) for exact
policies, failure recovery and bounds. Individual store commits do not constitute
a room-wide restore transaction.

## Selected source and raster byte files

`captureSharedAssetBytes({source, resolveAsset, signal?})` takes a genuine
`captureSharedAssetReferences` handle and an explicit guarded host byte resolver.
It admits exact SHA-addressed or host-verified opaque bindings, retaining every
generation and deduplicating immutable payloads. Missing source/bytes remain
Pending; producer or provider changes refuse. `exportSharedAssetBytesBackup`
creates a separate portable binary file. `readSharedAssetBytesBackup` checks
framing and raster integrity; restored native/component owners must separately
pass `archive.verifySource(freshCapture)`. Object URLs are local and revoked by
`archive.dispose()`. `encodeSharedRetainedStoreBackup` wraps exact captured records
under an explicit host identity for the existing insert-only restore factories.
See the [selected-byte contract](../../docs/SELECTED_ASSET_BYTES.md). This file
excludes asset-store upload state, unselected participants and server state; it is
not a room-wide transaction, provider grant, generation bridge or deletion proof.

## Physical server generation inventories

`readSharedServerLogGenerationParticipantInventory(file, expected)` admits the
separate native physical-generation metadata family. Select `expected`
independently from authenticated native capture; do not derive trust from the
incoming file. The immutable reader retains the global native cut, physical
manifest, complete native archive digest and whole inventory digest.

`checkSources`, `checkGenerationSources` and `checkMixedSources` use genuine client
backup/capture pairs. Mixed entries carry explicit `original` or `generation`
family tags. Results retain `{source, coverage}`, including physical-only changes
that leave document counters unchanged. Missing/unbound histories stay pending;
duplicate writer/review copies refuse. Checks do not flush, connect, authenticate,
acquire leases or activate a room. Existing writer/actor exclusion still applies
when opening the actual client owners.

The original reader and catalogs keep their old formats and limits. This new
reader does not establish complete provider/client closure or whole-room
activation. See the [physical participant contract](../../docs/SERVER_GENERATION_PARTICIPANT_INVENTORY.md)
for selection, bounds, ownership and remaining integration requirements.

## Physical room file retention

`SharedPhysicalRoomRecoveryCatalogArchive` separately selects complete original
and current generation-server archives, current native participant metadata and
all original/generation client copies. `SharedPhysicalRoomRecoveryCatalog.begin`
atomically retains those files only in a fresh database; `resume` and `verify`
re-admit actual durable bytes against the independent selection. Occupied
destinations are never overwritten, and historic copies are never silently
chosen or discarded. Existing catalog versions and protocols stay unchanged.

Both require the matching explicit Wasm digest module and synchronous host
authority. `hashSharedArchive` and `readSharedServerLogGenerationRoomArchive`
use a dedicated bounded native SHA-256 owner, without whole-large-file buffer
reads or a hash fallback. Integrity does not confer native replay or account
authority. Cached `checkSources` diagnostics retain full physical pins and leave
unreconciled histories pending; they perform no I/O or activation. See the
[contract](../../docs/PHYSICAL_ROOM_RECOVERY_CATALOG.md) for exact bounds, immutable
storage, cleanup, continued-origin limitations and remaining operational work.

## Physical room client staging

`SharedPhysicalRoomParticipantStage.begin` and `resume` take a genuine physical
catalog, an independent selection and fresh native/host policy. Success transfers
the actual catalog database, archive and lease into a distinct staging owner.
`stage` restores explicit original/generation clients privately and read-only;
`check` re-admits actual source bytes and native stores. Cold progress markers do
not stand in for reopening those owners. Historical copies remain unresolved,
and no editable parts, connection or activation is exposed.

Its separate insert-only intent, exact retries, synchronous ownership transfer
and retryable cleanup leave immutable files and older catalog protocols intact.
Closed owners release private data maps without deleting durable files. See the
[staging contract](../../docs/PHYSICAL_ROOM_PARTICIPANT_STAGING.md) for policy
snapshots, limits, native history tests and remaining operational integration.

## Physical room client continuation

`SharedPhysicalRoomClientOperation` takes an actual completed physical stage,
keeps the catalog/stage/operation stores and leases together and restores every
selected native client before an all-or-none disconnected handoff. The initial
handoff remains read-only; cold resume requires explicit fresh factories and
current document/review policy. Saved completion never substitutes for native
readiness, and permanent review observers cannot be promoted into commenters.

The separate intent never rewrites the source schemas or duplicates their large
files. Exact retries, partial-progress recovery and close/cancellation retain
all histories, uploads and unresolved historical copies. This is client-side
continuation, not native-host ancestry transfer, provider reconciliation or
authenticated server activation. See the
[client-operation contract](../../docs/PHYSICAL_ROOM_CLIENT_OPERATION.md).

`SharedPhysicalRoomRecoveryHost.open` selects a separate authenticated read-only
operator endpoint. `operation.checkNativeHost(host)` checks actual native A/B/C
and provider ownership while holding every selected client and its current native
history. This keeps later offline edits, never infers a relay binding from a local
review actor, and leaves missing or historical copies Pending. It does not write
whole-room intent, flush clients or grant activation. Ordinary editing routes and
exact-backup readers are unchanged. See the
[live control contract](../../docs/PHYSICAL_RECOVERY_CONTROL.md).

## Retained image references

`core.supportsRetainedAssetReferences()` requires the complete optional native
capability. `retainedAssetReferences(revision?)` returns immutable image bindings
from retained shared causal history, including inactive or losing replacements,
deleted images and Redo. After asynchronous host work,
`checkRetainedAssetReferences(read, revision?)` requires this live owner's exact
current read; copied/foreign/stale metadata rejects. Unsupported or incomplete
native histories refuse completeness, without changing recovery bytes. Separate
versions/outboxes, queued SDK remote frames and extension assets require their own
coordination. This read never fetches bytes or authorizes asset deletion. See the
[retained-reference contract](../../docs/RETAINED_ASSET_REFERENCES.md).

`core.supportsPacketAssetReferences()` separately requires matching native packet
reads. `versionAssetReferences(packet)`, `suggestionAssetReferences(packet)` and
`suggestionRevisionAssetReferences(previousPacket, revisionPacket)` return frozen
source-bound metadata. Snapshots inventory their admitted content; proposals and
revisions inventory conservative native source-and-intent history, including
intermediate/deleted image bindings. Missing proposal source is explicit
`outcome.kind === "pending"`, never an empty complete list. Native reads do not
accept a suggestion or authenticate its creator. Recheck each exact returned
object with `checkPacketAssetReferences(read)` after asynchronous work.

`captureSharedAssetReferences({core, session?, versions?, suggestions?, revisions?})`
combines the native inventory with explicitly selected paired-session versions,
`SharedDocumentVersions` catalog/cache, proposal queue and revision outbox. A
revision source requires its exact proposal queue. `metadata()` is frozen;
`records()` retains exact exported recovery JSON; `check()` rechecks native and
producer-record continuity without flushing or publishing. An uncached known
version or unavailable proposal source makes the whole capture Pending. Resolve
that dependency separately and capture again. `dispose()` releases the capture,
not the borrowed sources; detached metadata remains readable but is not a live
proof. Omitted stores, SDK remote queues, extensions, provider bytes and server
state are excluded. This is not a complete-room backup or restore transaction.

Version catalogs pin their original borrowed owner/configuration through startup
and awaited source saves. Replacing `storage.core` refuses with
`version_source_replaced`; exact prior recovery records remain exportable. Restore
the original source before retrying. This guard is not cross-device writer fencing.

## Counts and heading outline

`SharedRichEditor.supportsWritingTools()` reports the complete optional native
capability. `writingTools(revision?)` returns immutable accepted-document counts
and heading metadata at the exact shared publication, without changing causal
state or history. The owner must still be active; read-only policy permits reads.
`mountSharedWritingTools(asideHost, domController, options?)` borrows the existing
DOM owner, including remote-update refresh and exact-source heading navigation.
Dispose controls before retiring the writer. No new save, operation or history
family is selected. The [writing-tools contract](../../docs/RICH_WRITING_TOOLS.md)
defines bounds, labels and refusal behavior for older runtimes or stale reads.

## Native fullscreen

`createSharedFullscreen(dom, {target?})` and
`mountSharedFullscreenControls(host, controller)` borrow the existing shared DOM
coordinator without transferring its writer or holding remote updates. Managed
owners expose the same port through `editor.fullscreen()`. Entry requires native
browser support, a user gesture and the exact idle publication outside composition.
It does not alter document/history protocols or reparent the surface. Controls
may be replaced without exiting; await the separately owned controller's
`dispose()` before replacing its target/editor. Failed native cleanup retains a
retryable retirement handle and never exits a foreign session. See [the contract](../../docs/RICH_WRITING_TOOLS.md#native-fullscreen).

## Document placeholder

`placeholder: 'Start writing…'` on DOM/managed startup selects a literal prompt
outside editable content, not an operation or saved setting. Native profile
`placeholder_version()` allows rejection before a durable writer is opened.
`SharedRichEditor.supportsPlaceholder()` and `placeholderEmpty(revision?)` expose
the separate exact-publication read, including read-only eligibility. The DOM
shows the hint only while editable and not composing. One empty root paragraph/
heading qualifies; whitespace, additional blocks, code, lists, images and tables
remain content. Old runtimes reject the explicit option; omission preserves
startup/DOM defaults. See [the prompt contract](../../docs/RICH_WRITING_TOOLS.md#document-placeholder)
for label limits and startup configuration. An admitted DOM/managed owner exposes
`setPlaceholderLabel(textOrNull)` for live cosmetic changes without rekeying or
reopening its writer. The setter also works while readonly/composing and does not
enable a mode omitted at startup.

## Ownership and host responsibilities

The generated module exposes configured `SharedRichProfile` factories,
`SharedEditorOwner`, opaque `SharedObservation` values, privately constructed
`SharedVersionRestorePlan` and `SharedSuggestionPreparation` proofs and initialization only.
Its generated types have no public constructors for those classes. Fixed-schema
probe constructors, exercise functions, raw engine import/export and unguarded
research authoring methods are excluded from the application build. Use the
factories rather than manually constructing generated objects.

The root exports `SharedRichEditor`, `SharedPersistentSession`, DOM/toolbar
coordinators, relay sync, presence and asset providers. `view()` is a detached
publication; mutations use the owner's current opaque Rust observation. An
optional exact revision rejects asynchronous work prepared from an older view.
Remote publications can be held across input/composition and remain bounded.
Callback failures cannot rewind content already committed by Rust.

DOM and root/React startup may explicitly select `inputRules: "markdown-v1"`.
It requires the current native browser-routing capability, is immutable per
owner and is not persisted in checkpoints. The exclusive native call retains
literal typing before its separate conversion group, so one Undo restores the
literal shortcut; callbacks see the final result once. `onInputRuleRefused`
means the input was accepted and must not be retried. Paste, composition,
replacement/range edits and remote events stay ordinary input. Whole-source
replacement now preserves resolvable selection gaps; newly supported cases
need the fixed shared reader, because affected older alpha readers still
reject their replay. Match room participants and backup readers to the runtime.

`insertSharedImageFiles` snapshots the bounded file list and insertion position,
then holds remote publications across asynchronous ingestion. Its original exact
revision still rejects local UI/history changes; bytes remain available after a
failed insertion, and success or failure releases the remote hold.

`SharedRichEditor.hardBreak(revision?)` replaces the current text selection with
one LF in one author-local history group, retaining logical-start formats and
peer changes. Shift+Enter invokes it without splitting a paragraph. Explicit
`beforeinput` replacement targets are honored separately. The additive guarded
Wasm method uses the existing text protocol, not a new shared operation. A
compatible older binding falls back to its equivalent guarded plain-text call.

Original shared V1 configuration declares a schema name/version, an extension
array and optional tightened document limits. Extensions declare exact IDs,
dependencies, conflicts and typed inline formats. Properties have required or
optional presence and bounded Boolean, integer or UTF-8 string domains. Rust
computes the complete fingerprint; a caller-provided fingerprint is not a schema
declaration. Typed inline extension support does not admit arbitrary block kinds,
callbacks, HTML or CSS. The explicit standard V1 factory adds the same bounded
twelve-format manifest as the local owner, without changing ordinary factories.

`core.supportsInlinePropertyPatches()` reports the additive guarded Rust planner.
`core.patchInlineFormatProperties({format, properties, targets}, revision)` patches
named fields of an existing format on every selected character. `format` is a
complete typed template; `properties` lists only the fields to copy. Targets use
`{block, offset, length}` with scalar-aligned UTF-16 boundaries. Missing formats,
duplicate targets/fields and stale revisions reject without publication. Matching
standard Link controls use this path when one form field is left blank. Other
observed fields and unrelated formats survive. The planner coalesces equal
results and keeps the existing 64-command group ceiling; oversized requests fail
atomically. Persisted operations remain ordinary complete-format annotations,
with the original whole-format concurrent conflict policy and author-local Undo.
There is no silent fallback for older owners lacking this capability.
Configured factories prove schema admission; they do not authenticate a user,
lease a writer or persist data automatically. A host still supplies identity,
durability, asset-byte storage and optional transport.

Keep the writer lease while a failed local flush is retried. A session close
permanently retires publication before awaiting storage: failed closure retains
checkpoint reads and the lease for retry or explicit discard, not further editing.
`discardAndClose()` now returns a promise that waits for an already-started
transaction and writer release. A database version change unblocks storage but
retains the retired native journal rather than silently discarding unsaved work.

The private editor SDK supplies `openSharedEditor` and the separate
`@breditor/editor/collaboration/react` lifecycle. It borrows the DOM owner from
the durable session, serializes React replacement and requires a failed-close
recovery handoff. Low-level DOM mounts still transfer core ownership by default;
`coreOwnership: 'borrow'` is explicit for a session-managed core. Server
acknowledgement and uploaded assets are not the local journal save state.

## Optional document review

Use the explicit `SharedReviewPersistentSession` for atomic local recovery of
document history, comment history and a named-version catalog. Its `create` and
`restore` callbacks run after independent document/review writer leases are held.
Select the exact language, history, range and selection policies on every opening;
the restore callback must use the matching native journal factory. Original
document-only sessions intentionally refuse live comments and paired records.
Legacy-to-review migration is not automatic.

Attach controls to that session's enabled native core:

```js
import {mountSharedReviewPanel} from '@breditor/collaboration';

const panel = mountSharedReviewPanel(reviewHost, reviewSession.core, {
  policy: () => liveReviewPolicy,
  versions: reviewSession,
  allocatePrefix: () => app.reserveNeverReusedPrefix(),
  nowMs: () => Date.now().toString(),
  onError: reportError
});

// Borrowed controls do not close native writers or discard unsaved recovery.
panel.dispose();
await reviewSession.close();
```

The policy callback governs affordances, not authority. Native comment policy is
supplied separately when enabling/restoring review and updated explicitly through
`setReviewAccess`. Plain comments are never HTML. Edit drafts retain their original
guards through peer updates; resolving concurrent bodies requires an explicit new
edit. Review guards are live owner-bound objects, not serializable tokens.

Version restore requires a fresh native preview and explicit confirmation. It
authors one new undoable group, retains current comments and gives restored nodes
fresh identities. Asset bytes remain host-owned. Failed local saves retain readable
paired recovery and both leases for retry or explicit discard. The local catalog
has 32 entries and the whole paired record has a 32 MiB ceiling. These controls
use the programmatic shared facade. Authenticated review synchronization and a
separate shared version client are opt-in; suggestions and final combined
installed/browser qualification remain open. See `docs/RICH_REVIEW.md` for the
paired review relay contract and exact recovery requirements.

### Proposed changes and durable choices

`core.supportsDocumentSuggestions()` requires the complete matching native
capture/source/preview/receipt pair. `captureSuggestion`, `readSuggestion`,
`verifySuggestionSource` and `prepareSuggestion` are pure, including in read-only
documents. Ready previews are disposable native-backed handles; check them with
`checkSuggestionPreview` before use. Their frozen content remains readable after
disposal, but the proof cannot be reused. Proposals do not change accepted content.

`SharedSuggestionQueue.open({database, identity, storage})` borrows a durable
document or paired review session. Pin its nonsecret identity from the
authenticated suggestion lane and exact document writer; keep credentials and
live roles elsewhere. `propose` retains an immutable native packet.
`queueDecision` retains an offline choice; a new Accept needs a current preview
for that exact proposal. `flush` saves source journals before the dependent queue.
It does not claim server finalization, and the queue never closes the borrowed
session. Close it before closing that session; failed close retains readable
recovery and the cache lease for retry or explicit discard.

Authenticated host integrations use the explicit `receiveVerifiedPublication`,
`cacheVerifiedProposal` and `receiveVerifiedDecision` methods. An Accept receipt
arriving before its native effect returns `waitingForDocument`; import actual
catchup and retry instead of re-executing the proposal. Native V2 receipt checks
prove retained operations, not account roles, server durability or Undo ownership.
The server winner remains distinct from an opposite locally queued choice.
For document authors, the optional automatic adapter shares the existing author
socket instead of opening another writer lease:

```js
const documentSync = new SharedRelaySync(reviewSession.core, {
  identity: documentIdentity, // Explicit atomic-v2 identity.
  getToken,
  suggestions: {
    binding: queue.identity().binding,
    effectWriter: queue.identity().effectWriter
  },
  persistLocal: async () => {
    reviewSession.save();
    await reviewSession.flush();
  },
  autoConnect: false
});
const suggestions = new SharedSuggestionSync(queue, documentSync);
await documentSync.connect();
await suggestions.flushShared(); // Current queued targets, server outcome and local receipt.
```

Use `createSharedDocumentRelaySync` with explicit `selectionEditing: 'document-v1'`
for a document-selection owner. `suggestions.entries()` exposes bounded live
metadata; `loadSuggestion(id)` lazily caches an authenticated native packet.
Discovery is not a persisted global catalog, and imported effects do not become
accepting-user Undo. Stop the suggestion adapter before closing its queue/source;
it never disposes the borrowed document connection. Permanent Reader transport,
accepting-user Undo and borrowed vanilla/React proposal controls are separate
opt-ins. See [the review contract](../../docs/RICH_REVIEW.md) for exact bounds.

### Immutable revisions and formatting rebase

`SharedSuggestionRevisions` borrows the same source, queue and transport. Pin the
separately enabled host revision descriptor's binding and supply
`suggestionRevisions: {binding}` on that transport before connecting. Revisions
retain exact predecessor and child bytes; the host alone finalizes pending-only
supersession. A child enters the ordinary suggestion queue only after its
authenticated revision receipt is saved. Never publish extracted child bytes as
an independent substitute for that relation.

With the complete optional native pair,
`core.supportsSuggestionFormatRebase()` is true. An already-open outbox can retain
a native original-character formatting revision:

```js
const result = revisions.rebaseFormat({
  previousSuggestionId: selectedSuggestionId,
  title: "Rebased formatting",
  createdAtMs: Date.now().toString(),
  revision: core.view().revision
});
if (result.kind === "queued") await revisions.flush(); // Local intent only.
```

The native planner preserves ordered `SetFormat` batches, excludes new peer text,
and retains unrelated formats. Changed values of the edited format kind or lost
original characters conflict; unsupported/mixed actions queue nothing. The
whole lowered batch is bounded to 64 steps. Retries preserve exact bytes rather
than recapturing against newer content. Existing complete revision runtimes
without the optional pair keep manual revision support with no JavaScript
fallback. Passing this outbox to `createSharedSuggestionPanelSource` exposes the
same separate rebase action in vanilla and React controls. Accepted content stays
unchanged until an independently previewed child is accepted by the server.

### Shared named versions

`SharedDocumentVersions` borrows a durable document or paired review session.
Discover and durably pin its nonsecret catalog identity once, then reopen the
same cache/identity with the exact native source journal. Account tokens remain
separate host-owned secrets:

```js
import {
  discoverSharedDocumentVersions,
  SharedDocumentVersions
} from '@breditor/collaboration';

const {identity} = await discoverSharedDocumentVersions({
  endpoint, principal, room, documentWriter,
  writerTransport: 'atomic-v2', getToken,
  saveIdentity: identity => app.saveCatalogIdentity(identity)
});
const versions = await SharedDocumentVersions.open({
  identity, database: 'app-shared-versions', storage: reviewSession,
  getToken,
  flushDocument: () => documentSync.flush()
});
versions.saveVersion('Before review', Date.now().toString());
await versions.flush();       // Local immutable packet and source journal saved.
await versions.flushShared(); // Server acceptance and local receipt both saved.

// Pass versions instead of reviewSession as the review panel's versions port.
// For a remote metadata-only entry, loadVersion validates and caches its packet.
const packet = await versions.loadVersion(selectedVersionId);
const comparison = reviewSession.core.compareVersion(packet);

await versions.close();       // Closes only this catalog cache and transport.
```

This separate cache does not automatically import a paired session's old local
catalog. Explicit `queueVersion(packet)` admits an existing native source-proven
packet without recapture. Offline publication remains queued until the host has
accepted its document dependencies. Remote metadata arrives through negotiated
hints; cached packets remain usable offline. `versionStatus` distinguishes cached
content, local save, queued intent and server acceptance. Failed saves retain
readable recovery and the cache lease; `retry` never silently takes a new version.

The client retains at most 32 packets in a 32 MiB escaped record, independently
of the server directory. No automatic eviction is performed. Explicit
`stopRetryingVersion` keeps the local snapshot and cannot revoke a server
transaction already received. `forgetCachedVersion` refuses queued or in-flight
packets. Close borrowed controls before closing the catalog, then close the
native document/review session last. Asset bytes remain host-owned.

### Image availability during review

An accepted image proposal or saved version proves document metadata, not remote
raster availability. Keep the host's `RichAssetStore` separate and use
`SharedRelayAssets` for explicit upload/download. Local ingestion retains bytes
before a proposal is captured; call the asset provider's `flush()` before
publication if your application requires remote availability at that point.
A missing server raster remains retryable without changing the accepted image.
Remote downloads are verified and cached without entering the upload queue.

Version restore and accepting-user Undo retain immutable raster hashes but never
upload, delete or garbage-collect bytes. Keep image bytes needed by retained
versions/history. Restore creates fresh node identities; existing image comments
may become orphaned while their captured quotations and replies stay readable.
The [review and asset contract](../../docs/RICH_REVIEW.md#image-bytes-during-review-and-restore)
includes separate native-host and clean-installed combined-workflow commands.

## Natural shared typing history

`SharedPersistentSession.open({history: 'typing-v1', ...})` selects native grouped
typing for either language. Omitted history remains explicit. A requested mode
requires the exact native capability; it never falls back to JavaScript history.
Use `core.typeUser(text, clockMs)` or `core.deleteUserRange(selection, direction,
clockMs)` only for user input, with canonical decimal u64 clock strings. Ordinary
`type`, paste, composition and dispatch keep explicit boundaries. `closeTypingGroup`
is an observed intent fence, not a content edit.

`core.checkpointJson()` selects the separate grouped family only after native
admission. Restore it with `restoreSharedTypingEditor(profile, room, checkpoint)`;
the original profile factory rejects that family. A persistent session's history
policy is immutable. Its restore callback receives the declared stored policy as
its second argument; select the matching native factory, not an AST import.

Explicit storage keeps legacy exact strings. Grouped storage uses a versioned
record, and default openings reject it without overwriting it. An explicit opt-in
can atomically upgrade a legacy journal while retaining old units and Redo; failed
saves leave the original durable record intact. The 16 MiB journal bound and
exclusive writer lease are unchanged. See `docs/RICH_TYPING_HISTORY.md` for the
record contract, false-result Undo publications and timing/qualification limits.

## General range input bridge

The source-level bridge requires a matching runtime with
`core.supportsGeneralRanges() === true`. Call `core.enableGeneralRanges()`
explicitly before `replaceGeneralRangeText(selection, runs, prefix)`,
`replaceGeneralRangePlainText(selection, text, prefix)` or
`replaceGeneralRangeTypingText(selection, text, prefix, clockMs)`. Optional
revision arguments retain exact publication guards. Rich runs use
`{text, formatsJson}`; first-key input also requires native natural history.
Rust decides styles, structural coverage and fresh paragraph allocation.
Reserve a new namespace prefix for every request, including failed/undone work.

The new mode preserves actual before-UI and selects separate general ordinary
or natural save families. `core.checkpointJson()` chooses the native getter;
`restoreSharedGeneralEditor(profile, room, checkpoint, history)` requires the
explicit matching recovery capability. There is no original-factory or
JavaScript command fallback. `SharedPersistentSession.open` accepts explicit
`rangeEditing: 'general-v1'` independently from `history` and `richLanguage`.
General records declare those policies outside opaque native JSON; legacy
records keep their exact shapes. An explicit reopen can upgrade an original
journal transactionally; a live session cannot switch behind its storage guard.
General stored records require matching opt-in and language on every reopening.
Use the restore callback's optional third range-policy argument to choose
`restoreSharedGeneralEditor`; original records still invoke the callback with
exactly two arguments. Failed upgrades retain the old durable value; failed
closes retain the exact retired owner and lease for retry.

Shared DOM plain typing, replacement, selected deletion, Shift+Enter and plain
paste follow the observed general mode. Cross-cell browser text ranges retain
partial endpoints; cell-picker grids remain explicit. Native general rich Copy,
inline/flow paste and cross-range paragraph Enter are implemented with separate
capability checks. Caption/code flow/grid paste uses separately declared native
text conversion with an explicit formatting-loss notice; structured paste never
silently falls back. Whole-document Select All remains required. A general
session must not bypass a relay's journal or digest guard. See the
[native contract](../../docs/RICH_GENERAL_RANGES.md).

### Caption/code paste losses

`supportsClipboardTextPolicy()` requires the exact native V1 policy and its
guarded read. `projectClipboardText(selection, clipboardJson, revision)` returns
a native text/loss report for caption/code starts, or null for prose. It is a
pure read, including in read-only mode; mutation still requires the matching
publication and write policy. The controller performs one explicit plain edit,
then shows the loss notice and calls `onPasteLoss(report)`. It never uses a failed
structured paste to select conversion. Empty or oversized projected text rejects
without deleting selection. See the [functional checkpoint](../../docs/qualification/2026-10-16-caption-code-text-paste-functional.json).

### Explicit writer transport V2

`supportsWriterTransportV2()`, `writerGroupsV2(after)` and `writerClockV2(writer)`
use the native packing-independent atom-lineage contract. Original reads keep
their original digest meanings. Registration explicitly requires
`writerTransport: 'atomic-v2'`; persist that field with the returned identity and
pass the unchanged identity to `SharedRelaySync`. The matching native room must
have been created with `Room::create_atomic_transport_v2`. Neither side upgrades,
sniffs frame versions, or falls back to original digests. Wrong-mode handshakes
reject before writer allocation. Range and natural-history policies remain
independent and require their matching native recovery factories.

The [functional checkpoint](../../docs/qualification/2026-10-16-writer-transport-v2-functional.json)
exercises real release Wasm and a temporary native host, including two offline
authors, host restart, exact journals and selective Undo/Redo. It is not browser,
public deployment or final release qualification.

## Source and compatibility

Rust source is canonical in `crates/breditor-collaboration`; browser source is
canonical in this package. The legacy feasibility manifest and experimental npm
package compile the same source with their original research surface. They are
compatibility/testing paths, not dependencies of this application package.

Configuration V1, ABI 1, model 11, journal 12, deterministic engine tag and
existing serialized meanings are unchanged. A local rich checkpoint is not a
shared journal. The default editor/Wasm graph remains independent of replication.
The native core's explicit rich-language V2 structural schema is not admitted by
model 11; profile creation rejects it before seed parsing or engine import.

## Explicit layout V3 candidate

`compileLayoutSharedProfileV3` and `compileStandardLayoutSharedProfileV3` select
configuration 3/model 13/journal 14. `SharedPersistentSession.open` must also
explicitly select `richLanguage: 3`. Defaults and V2 entry points remain strict.
`createLayoutSharedToolbarV3` composes structural and independent layout controls
for that owner. `core.changeSelectionLayout(patch, revision?)` lets Rust derive
targets; `core.blockLayoutState()` reports independent mixed/inherited fields.
The low-level `set_block_layout` command retains strict raw `patch_json`, including
duplicate keys for native rejection. It is not admitted by old models.

The reference relay has separate `create_layout_v3` and
`create_standard_layout_v3` factories with a new `seedLayoutV3` durable record.
They never reinterpret existing logs. See `docs/RICH_BLOCK_LAYOUT.md` for bounds,
independent concurrent registers, selective history and browser qualification.

## Explicit structural V2 candidate

`compileStructuralSharedProfileV2(wasm, configuration)` compiles bounded format 2
configuration without extra inline formats. `compileStandardStructuralSharedProfileV2`
also composes the original standard inline V1 manifest. Their generated native
factories are `from_configuration_json_v2` and
`from_standard_configuration_json_v2`; neither original factory changes.
V2 descriptors require the exact language 2/model 12/journal 13 tuple. V1 keeps
its original tuple and descriptor shape. A mismatched or older module rejects
before creating a writer; schemas and histories do not migrate automatically.

Transfer the resulting owner to `SharedRichEditor`, or explicitly select
`richLanguage: 2` in `SharedPersistentSession.open`. Storage defaults remain V1
and reject crossed journals without overwriting them. For a managed vanilla or
React host, use the same explicit option through `@breditor/editor/collaboration`.
`createStructuralSharedToolbarV2` binds standard and structural controls to that
exact V2 core. Named native commands own task completion, wrapping, split/join,
indent/outdent/empty exit, quote wrapping, code conversion/language and rules.
The command shape remains Breditor's own closed shared protocol, not the local
command DTO or another editor's protocol.

Reference relay creation is explicit too: `Room::create_structural_v2` or
`create_standard_structural_v2` writes a distinct V2 seed record. The CLI equivalents
are `init-v2` and `init-standard-v2`. Reopening follows the recorded seed policy;
original seeds and original `create`/`init` remain V1-only. Clients verify the
language/model/history binding before importing authenticated catchup. This
candidate still needs the retained reliability and broader V1 release gates.

Run `node scripts/check-editor-package.mjs` for clean local-only, shared-only and React SDK installs
and production Vite pages. The application-network browser matrix uses the same
strict assertions as the legacy installed matrix, but with this package's own
runtime and coordinators. Native IME, accessibility, historical WebKit fault,
performance budgets and public deployment remain separate qualification gates.

## Operational participant recovery

`OperationalSharedParticipant.begin` transfers a genuine completed
`RecoveredSharedParticipant` into durable operation custody before ordinary
editing. `resume` retains the original backup/plan and reopens actual later
native histories, packet stores and whole upload queues with explicit fresh
`currentPolicy`. `intoParts` returns ordinary owners while preserving their
native author leases. The original exact-cut recovery coordinator stays strict.
See [the operational contract](../../docs/OPERATIONAL_PARTICIPANT_RECOVERY.md)
for source retention, interrupted commits and retryable cleanup. Current
authentication/provider closure and cross-generation history preservation remain
separate work; an operational marker is not activation.

## Operational room recovery

`SharedRoomOperationalRecovery.begin` consumes genuinely staged catalog custody
after atomically retaining all original files and a selected child-operation
plan. The returned attempt keeps native owners private; `finish` resolves ordered
partial/lost-acknowledgement child commits before aggregate `intoParts` handoff.
`resume` requires the original explicit factories/targets and separate fresh
`currentPolicy` per participant, and can reopen later native journals without
restoring the old catalog cut over them. Historic copies remain retained and
unreconciled, not automatically obsolete. See [the room contract](../../docs/OPERATIONAL_ROOM_RECOVERY.md)
for cancellation, lease ownership, retryable cleanup and activation boundaries.

## Retained input source restore

The private restored-operation source path replays a selected complete snapshot
or flat lineage through original, acknowledged, pending and latest live native
states. It retains the full incoming file and legacy original in a separate
journal, resumes interrupted saves before later cuts, and reopens from that
retained input under fresh host policy. Native document/comment histories,
local versions and delivery packets remain in their original formats.

The private whole-participant coordinator now joins that source with the actual
upload store, retaining custody through native replay and final current-policy
handoff. Cold resume preserves later native edits and upload receipts without
resetting them to the input. Source journals explicitly bind the parent/upload
names; standalone restore remains a separate plan profile.

An independent private read scope now retains the actual journal/input/native
origins under fresh read authorization even after the write grant or signal
expires. Shutdown waits for outstanding scopes and real digest/raster I/O.
Read permission never selects a writer factory or permits saving. A complete
export must still capture LIVE/uploads under an unchanged source stamp.

The next complete provenance export and room reconciliation/activation remain
required before a public complete-participant restore API. Older exporters
refuse this source instead of returning an incomplete recovery file.
