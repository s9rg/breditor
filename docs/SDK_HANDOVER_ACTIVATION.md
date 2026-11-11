# SDK activation of an inactive sealed successor

The host seals the genuine source and retains its complete server backup before
restoring the successor. It prepares a durable Native activation checkpoint and
an independently authenticated activation control. The successor remains
inactive. Its Native, provider and sealed-path read controls can verify the
current source without starting ordinary client service.

The private metadata coordinator adds three explicit operations:

- `prepareNativeActivationAcrossHandover` takes the genuine pre-provisioned
  activation host, complete recovery inputs and sealed path. It captures all
  original packets, Native/server files, rasters and current reconciliation
  under one real source reservation. It checks the actual path around capture
  and retention. The independent `retainChoice` hook receives only inert data
  and finishes before absent-only intent creation. No activation is requested.
- `readNativeHandoverActivationIntent` reopens the exact existing intent and
  verifies its complete data against the current local metadata binding. This
  read grants no service and sends no activation request.
- `commitNativeActivationAcrossHandover` requires the same selected genuine
  path, a genuine historical Native inspection host and a fresh approval. It
  reauthenticates the path and repeats exact client, metadata, packet, raster
  and Native inspection around approval. It records `request-started` before
  sending the authenticated Native request. A complete receipt is retained only
  after the actual selected path remains valid.

Provisioning happens before preparation. There is no resource-producing
provisioning callback inside the room reservation. The existing original
activation methods and formats keep their meanings.

Private controller ports expose their own and nested controller lifetimes and
synchronous guards. Closing any selected Native, delivery, path or activation
controller ends a pending data hook or approval. Late callback outcomes stay
observed. The actual request receives the same cancellation signal and drains
under its existing rules. Closing a checker does not retire the Native service
or acknowledge any client queue.

Commit-time inspection uses an explicit handover admission. The ordinary
inspector retains its exact restore-origin rule. A genuine authenticated path
must contain the original catalog origin and current cut in order, and its
selected current provider must equal the recorded provider. This admission is
valid only during that finite inspection; detached or copied values and expired
visits cannot reuse it. Native packet, metadata, raster and provider inspection
still run in full.

Every failure after the recorded attempt conservatively remains
`activation_outcome_unknown`. There is no automatic retry or rollback. Explicit
retry reopens all bytes and requires fresh path authentication, actual inspection
and approval. The retained Native control returns the same receipt and actual
epoch on repeated commit. Original Pending/cache facts, offline operations,
metadata packets, receipts and Undo/Redo stay separate from activation.

## Reassociating retained data after a Native restart

The internal `prepareHandoverActivationReassociation` action takes the
independently selected prior intent and fresh authenticated activation and path
controllers. They must identify the original source and sealed path, including
every previously admitted cut in order. The checkpoint must be the original
pending checkpoint or the direct next checkpoint following the original planned
epoch. The action retains a new choice independently before creating a separate
namespace with the exact original graph and ordered Blob bytes.

The new intent starts prepared. The original namespace keeps its last
observation, including an observed receipt. If the new choice was retained
before a storage interruption, `resumeHandoverActivationReassociation` can finish
the local write or reopen the exact committed result with that choice. It needs
no live HTTP controllers for the local write. Native requests and publication
still require their own live controllers and approval.

Run `node --test scripts/handover-activation-reassociation.test.mjs` after
building the collaboration package. The installed counterpart is
`node scripts/check-handover-activation-intent-installed.mjs --reassociation-contracts`.
These checks use a pinned recovery corpus and controlled HTTP and storage.

## Native activation verification

Run `node scripts/build-handover-native-activation.mjs` to build the separate
`native_handover_activation_sdk_functional` fixture. It uses real public Rust
handover, recovery, provider and activation APIs. Its private IPC prepares and
observes controls; it cannot commit the target. A pre-commit service request
refuses. Only authenticated HTTP obtains the real active router.

The publication fixture selects an explicit handover mode that holds the normal
listener in the existing Rust publication owner. Native activation installs the
epoch, then the separately authenticated publication request starts the normal
routes. The test reads the normal health route before observing publication via
fixture IPC. It retains the complete handover choice and publication selection
as an association, drops the first successful reply, retries the same pin and
checks the actual durable deployment. A different pin is refused.

Run `node --test scripts/native-handover-activation-host.test.mjs` for the Native
activation boundary and `node --test scripts/native-handover-publication-host.test.mjs`
for the authenticated listener boundary. Run
`node --test scripts/native-handover-activation-coordinated.test.mjs` for seven
cold SDK owners, fourteen retained offline document and comment lanes, complete
handover intent bytes, lost activation and publication replies, normal protocol
delivery, provider reconciliation and future Undo/Redo.
`node scripts/check-handover-native-activation-installed.mjs` runs these workflows
and the controller and intent checks from independent offline package archives.

These fixtures use controlled Node IndexedDB, locks and image decoding. The
publication association binds the actual Native service and listener to the
retained choice. The whole-room coordinator still needs to sequence replacement
owner promotion and metadata continuation before publication. Process-crash
recovery, the remaining policy combinations and V1 release checks remain open.

## Metadata continuation on a private replacement

`previewHeldRoomMetadataContinuationAcrossHandover` requires the actual promoted
room target and a live sealed path controller. It replays the original metadata
journals, checks the target's native streams against the successor's current
inventory and pins the full path alongside the existing continuation facts.
The path includes the seal, earlier cuts, successor ancestry and current provider.

`continueHeldRoomMetadataAcrossHandover` takes a fresh decision on that choice
before retaining the four original files and creating any destination journal.
An interrupted run can resume from the same intent with fresh inspection and
approval. An existing intent from the ordinary continuation family is refused.
The path and target checks apply during approval, durable preparation and the
replacement journal writes. The continued metadata stays with the private
replacement until the whole-room owner can publish it.

Run `node --test scripts/handover-metadata-continuation-replacement-native.test.mjs`
with the built handover fixture. The test activates an actual sealed successor,
interrupts a destination write and resumes it while the Native listener awaits
publication. The metadata continuation source and installed runners include this
workflow alongside the original same-origin workset.

## Native process exit during a sealed handover

The relay test exits the child process before the successor commits and again
after the commit reaches disk. A fresh process reopens the selected operational
target, verifies the same historical seal and ordered archive path, and
reauthenticates the original protected registrations. The prepared case keeps
its selected epoch. The committed case prepares a child epoch.

Both cases require a fresh authenticated activation and publication request
before the normal listener serves the original document and comment protocols.
Repeat requests return the same receipts. Run the test with
`cargo test --manifest-path experiments/relay/Cargo.toml --features server --locked --offline --release --lib durable_native_activation::process::`.
