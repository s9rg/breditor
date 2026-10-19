# Shared participant and upload state backups

The shared SDK can capture one declared participant's native history, paired
review state, selected retained packet stores and whole raster upload store at a
consistent cut. One portable file retains their original recovery bytes and
upload epochs. Existing factories restore each component without overwriting
existing work; a final verification checks the actual recovered owners together.
This is not yet a durable multi-database recovery or room-activation coordinator.

## Declare the participant and included stores

```ts
import {captureSharedParticipantBackup} from '@breditor/collaboration';

const identity = {
  participant: 'alice-desktop', principal: 'alice',
  source: {
    room: 'room', writer: '101', richLanguage: 3,
    history: 'typing-v1', rangeEditing: 'general-v1',
    selectionEditing: 'document-v1', searchHistory: null
  },
  stores: ['document', 'paired-session', 'version-catalog',
           'suggestions', 'suggestion-revisions'],
  assets: 'whole-store'
} as const;

const result = await captureSharedParticipantBackup({
  identity, assets,
  source: {core: session.core, session, versions, suggestions, revisions},
  checkAuthority() { host.checkParticipantAuthority(identity); },
  resolveAsset: resolveRetainedBytes,
  signal
});
if (result.kind === 'pending') {
  reportMissingDependencies(result.pending);
} else {
  try {
    const selected = result.backup.selection(); // Retain separately in trusted host storage.
    await savePrivateBackupFile(result.backup.file(), selected);
  } finally {
    result.backup.dispose();
  }
}
```

The host supplies the original room/writer, replay policies, participant/account
declaration and exact producer list in the ordinary source-capture order. An
included but undeclared producer, or a declared but absent producer, refuses.
Revision capture requires its matching proposal queue. Native and paired records
must match the selected source policy and each other. A declaration is not
participant discovery: omitted SDK remote queues, other devices, extension
stores, resume credentials and server state remain outside this scope.

`assets: 'whole-store'` explicitly includes every retained raster record in the
supplied database, including unreferenced, failed and cancelled uploads. A cache
shared by several documents may contain their private images too. Choose and
review its scope before exporting. Native original asset IDs and binding
generations are not rewritten to content hashes.

## Capture one consistent cut

`RichAssetStore.captureBackup(captureSource, {signal?})` validates the complete
asset inventory and byte counter inside one readonly IndexedDB transaction.
Before that transaction can finish, it invokes `captureSource` synchronously.
The participant helper uses that callback to capture genuine native and selected
packet recovery records. An asset writer cannot commit between this asset cut
and the synchronous source read; other callbacks cannot interleave within that
source read. No source is saved, uploaded or acknowledged.

The generic callback returns caller-supplied data, not new native provenance.
It must be synchronous and should perform only reads. Promise/thenable returns
refuse at runtime; ordinary async callbacks also refuse through the public type
contract. A callback can run before a later error or cancellation, so callers
that create borrowed handles must retain and dispose them on failure. The
participant helper owns this cleanup without closing the original owners.

Raster decoding and hashing follow asynchronously from that captured snapshot,
not a second database read. Later upload completion or cancellation does not
rewrite the captured epochs, attempts, status or opaque receipt code units.
Native publication, selected producer records and the host authority check are
rechecked across awaited work; changed sources refuse without a partial ready
backup. A new-path cancellation regression prevents a second transaction abort
from replacing the intended cancellation error.

`checkAuthority` must synchronously return nothing or throw. It is the host's
current participant/ownership check, not a portable credential or a cross-device
fencing implementation. The helper uses captured local content-addressed bytes
where available. Other or missing mappings require the explicit existing
[host byte resolver](SELECTED_ASSET_BYTES.md). Missing source, version or raster
dependencies return Pending with no usable partial file. Provider failures do
not echo private callback messages.

## Read and restore explicitly

`readSharedParticipantBackup(file, expectedSelection, {limits?, signal?})` checks
the independently selected complete file digest and source identity, closed
framing, both component digests and ordinary native raster admission before any
destination is opened. Never obtain `expectedSelection` from incoming file
metadata. SHA-256 binds selection and detects corruption; it does not authenticate
an account, provider, uploaded status or native history.

The immutable `SharedParticipantBackup` exposes exact `records()`, generation-
specific selected `blob(asset, generation)`, `uploadEntries()`,
`uploadBlob(contentAsset)`, `file()` and `selection()`. Whole-store entries retain
their original upload epochs and opaque receipts. `dispose()` releases retained
bytes; detached selection remains readable and grants no live authority.

Reconstruct the original independent component archives through
`pairedBackup()`, `documentBackup()` where compatible, and
`retainedBackup(explicitSourcePolicy)`. These return existing envelopes rather
than selecting a native factory or upgrading a history family. Restore the
original native schema/preset, language, history, selection, review/owned/search
policies and dependent bindings through the matching existing
[session](SHARED_SESSION_BACKUPS.md) and
[retained-store](RETAINED_STORE_BACKUPS.md) factories. Keep synchronization and
connection disabled. Reacquire writer authority separately.

Restore `uploadBackup()` with
`RichAssetStore.restoreBackup(destination, file, {uploadState: 'preserve'})`.
It starts no uploader and does not convert old pending/cancelled work into a new
server receipt. A pending upload may already have reached its old provider;
explicit later retries still require an idempotent current provider.

Create a fresh genuine `captureSharedAssetReferences` from all recovered source
owners and call `await backup.verifyRecovered(sourceCapture, recoveredAssets)`.
It checks the exact native records/reference pairs and, inside another active
asset snapshot, checks the recovered upload file against the selected original
digest. Checks repeat around hashing. Different epochs/statuses, missing files,
changed native sources and metadata-only copies cannot pass this verification.
It writes no completion record and grants no network-activation permission.

Several restored databases are not one transaction. If a component restore
fails, retain the original participant file and already committed destinations;
inspect/reopen exact matching components through their ordinary factories. Never
clear or overwrite them to retry. Durable attempt recording, restart resolution
and automatic multi-store adoption still need the wider recovery coordinator.

## Independent framing and limits

The independent `breditor/shared-participant-backup` version-one file uses MIME
`application/vnd.breditor.shared-participant-backup`. The 22-byte magic
`BREDITOR-PARTICIPANT1\n` and four-byte big-endian header length precede a canonical
closed UTF-8 JSON header. Its 16 KiB ceiling contains the declared identity,
exact contiguous selected-source/upload ranges and their SHA-256 values. A
header digest covers those declarations. The body preserves the original
selected-source/raster file followed by the original whole-upload-store file,
without gaps, overlap or trailing bytes.

The complete ceiling is 461,389,894 bytes: both existing component ceilings plus
the independent prefix/header. Original native/packet, raster, per-file,
dimension/pixel and upload-store limits stay unchanged. Decoding and Web Crypto
hashing use bounded in-memory copies; the ceilings are refusal bounds, not an
approved memory, latency or long-session operating envelope.

## Remaining whole room recovery

Files contain private accepted/deleted content, comments, proposals, raster
payloads and possibly sensitive opaque provider receipts. They are not encrypted
or a per-account download route. Resume credentials and current authentication
remain in separately protected host storage, not this portable document file.

Authenticated participant inventory, trusted client/server recovery selection,
protected registration recovery, current provider/writer authority and durable
resumable room-wide activation remain required. The
[joined server backup](SERVER_ROOM_RECOVERY.md) is a separate component, not a
global consistency guarantee. No garbage collection or counter increase is
introduced. The approved cross-generation Undo/Redo and outstanding offline-edit
bridge also remains unimplemented, so this functionality does not establish V1
readiness.
