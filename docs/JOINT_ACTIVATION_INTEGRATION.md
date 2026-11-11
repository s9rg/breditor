# Joint Native activation and local recovery

The controlled functional checkpoint is qualified below. Release readiness
remains separate. See [the retained qualification](qualification/2026-11-03-joint-native-activation.json).

The private joint owner connects four previously separate operations: retain the
original activation intent, commit the Native service, reconstruct the clients
with their actor custody, and continue metadata before publishing the service.
The replacement stays private until the last operation succeeds.

An unexpected closure of the joint intent database ends a pending publication
decision. The replacement remains private. A fresh attempt can reopen the exact
descriptor and its last durable publication observation.
Run the installed intent and origin checks with
`node scripts/check-metadata-continuation-installed.mjs --joint-intent-contracts`.

`JointRoomActivationAttempt` owns the warm operation. Its separate
`ColdJointRoomActivationAttempt` recipient reconstructs an interrupted local
operation from existing complete intent data and fresh actors. A saved phase or
receipt never substitutes for a new authenticated confirmation. The original
cold action retains its selected Native controls. The sealed restart mode
binds a new set of controls and uses the separate association described below.

## Ownership and ordering

1. `prepare` reads the actual source, metadata and retained execution, then
   retains an immutable joint descriptor before any Native commit request.
2. `commitNative` can lose its reply without releasing the original actors. An
   explicit retry queries the same actual Native owner. A negative decision
   sends no commit request.
3. `recoverReplacement` checkpoints original journals before closing them and
   transferring actor custody. A failed promotion leaves the target private.
   The cold recipient instead reacquires its own actors from the retained data.
4. `continueMetadata` verifies the original complete histories and creates or
   resumes distinct destination namespaces. Pending packets and acknowledged
   facts retain their original meaning.
5. `publish` performs a fresh target and metadata visit plus separate metadata
   and publication decisions. A lost publication reply remains uncertain until
   an explicit same-control retry succeeds and its observation is durably saved.
6. `publishedMetadata` returns the metadata data captured by that completed
   publication. Delivery must reopen it under a fresh target visit.
   `takeOwner` transfers the replacement once after this publication barrier.

`close` stops the held operation and drains its work before releasing custody.
Source and target visitors expire with their actual lifetimes. Existing ordinary
metadata APIs retain their strict field and family checks; held-target and
cross-family inspection are separate, explicitly admitted composition paths.
The new owners have no package-root export.

## Sealed handover

The sealed restart descriptor binds the original whole-room choice, the
selected checkpoint and sealed path, the fresh publication controller and
all prior metadata destinations. Each earlier descriptor keeps its own
namespace and byte pin. The separate journal starts prepared and retains
only advisory observations from the selected publication controller.

The descriptor checks use the output directory from the actual sealed
whole-room fixture. Set `BREDITOR_SEALED_RESTART_CHOICES` to the directory
containing `actual-joint-complete-independent-plan.json` and
`actual-joint-complete-continued-choice.json` and the
`actual-joint-prepared-native-intent-evidence` directory. Run
`node --test scripts/sealed-joint-reassociation-choice.test.mjs` for source and
`node scripts/check-handover-activation-intent-installed.mjs --sealed-joint-choice`
for independent package archives. These checks use controlled storage.

Preparation retains the complete selected descriptor before writing the new
Native capture and then the restart journal. It holds the original and
predecessor journals while the host retains the choice and during both writes.
An earlier metadata journal closing ends pending preparation or approval. If
the second write fails, an exact
resume can finish it from the retained choice and literal capture bytes.
The cold restart target has separate entry points for an interrupted local
execution and for an untouched prepared execution. Both keep the target
private while the fresh association is retained.
Confirmation reopens the complete restart association and verifies the
original room capture before and after a fresh decision. Only the selected
restart journal records the request and the authenticated response. A saved
receipt remains advisory on later confirmation attempts.

Closing the activation requester, inspection control, or a held original
review, metadata or activation journal ends a pending cold confirmation. Closing the publication
requester ends a pending decision during metadata replay or publication. A late approval cannot start
a request. Before the request-started record, cancellation preserves the
existing observation. Once the SDK starts recording the request, an interrupted
operation requires fresh approval and an authenticated retry.

The cold owner continues metadata through the path chosen by that confirmation.
Publication reopens that continuation, obtains a fresh decision and sends the
complete restart descriptor's digest to the selected publication controller.
Only an authenticated response, followed by verification of the held journals,
lets the SDK release the recovered owner. A failed or uncertain request leaves
the owner private and can be retried with the same selection.

`JointRoomActivationAttempt.beginAcrossHandover` reserves the actual original
owners and uses a distinct joint intent format. Its descriptor binds the complete
sealed path, the original metadata pins, the selected replacement execution and
the authenticated Native publication control. The publication request associates
its receipt with the exact serialized descriptor.

The original metadata owner must belong to the held source visit. After a
confirmed Native commit, the coordinator retires that source and transfers its
actors to the replacement. Metadata continuation and publication require a
genuine promoted target and the exact selected handover path. Publication
requires a fresh metadata replay and a separate approval. If the reply is
lost, the replacement remains private until an explicit retry confirms the same
receipt and the coordinator records it.

`ColdJointRoomActivationAttempt.resumeAcrossHandover` reconstructs private
clients from the existing descriptor and fresh actors after an interruption.
It reopens the original review and metadata journals under the promoted target
visit and reauthenticates the selected sealed path for each Native
confirmation. A previous receipt does not grant client custody or publication.
Reassociation with a different Native process remains a separate operation.

Build the collaboration package and the Native fixture with
`node scripts/build-handover-native-activation.mjs`. Run
`npm run test:collaboration:joint-handover` against source and
`npm run test:collaboration:joint-handover:installed` against independently
installed package archives. The cold checks are
`npm run test:collaboration:cold-joint-handover` and
`npm run test:collaboration:cold-joint-handover:installed`. They interrupt a
target transaction, close the first owner and open fresh genuine controllers.
The Native tests use controlled Node storage,
actual Rust HTTP controls, seven clients, fourteen offline streams and real
asset acknowledgements.

Both candidate profiles run the source and independent-package checks for warm
and interrupted handovers before checking the readiness inventory. Each
installed check emits its own fresh report with the verified publication and
final delivery result.

A cancelled IndexedDB open keeps its namespace reserved until the actual
request settles. If the caller has already closed the attempt, the settlement
finishes the retained cleanup. A fresh attempt can then acquire the namespace
under its own authority and follow the usual absent-only or existing-only path.

## Reproduced integration defects

An activation preparation can refer to the latest observed Native predecessor
while the retained client catalogue requires an earlier predecessor. Matching
current inventory does not make those predecessors interchangeable. The strict
inventory admission correctly refuses this mismatch. The private Rust fixture
now has a separately named `prepareJointActivationAfter` action that proves the
selected observed predecessor's ancestry before closing old control services.
It provisions new authenticated controls without changing the legacy action's
meaning or allowing a snapshot during pending publication.

A successful metadata resume can advance journal revisions while preserving
the metadata choice. Publication resumes metadata internally, so a caller's
earlier `continueMetadata` capture becomes stale. Reopening that old capture
correctly failed `local_review_delivery_integrity`. The completed publication
now exposes its own capture through `publishedMetadata`; the exact snapshot
check remains strict. The generic regression also performs a second successful
resume, refuses the earlier capture, and reopens the later capture.

These changes join the separately qualified request projection and Blob payload
storage repairs. Blob reconstruction now copies verified payload bytes into
independent storage rather than accumulating recursive Node Blob views. This is
a reproduced Node failure and does not establish a repair of the historical
intermittent WebKit or archive short-read faults.

## Verification scope

The complete warm source workset passes all 39 cases and the independently
installed interrupted-recovery workset passes all 44 cases. The separate focused
source workset passes 42 cases, Native compatibility passes 22 cases, and the
installed dependency/registry workset passes five. There are no failed, skipped
or canceled cases in these passing worksets. Earlier canceled runs remain
recorded separately.

Main rebuilds with strict declarations and passes its 42 focused integration
cases. All 2,873 distribution files match both the qualified producer and the
independent consumer. All 4,515 non-vendor TypeScript/Rust product inputs and
3,186 Native build inputs correspond to the qualified sources. The exact tested
Native fixture is copied without its compiler cache; normal Wasm is unchanged.

The final cold test report removes an unused, uninstrumented acquisition
counter. Only the warm test measures zero ordinary writer acquisition. This
report-only correction changes no assertion, workflow call or runtime input;
its exact before/after hashes are retained with the qualification.

One additional main regression passes with seven genuine cold targets, three
metadata lanes and both original journals invalidated separately. It confirms
portable reads across the snapshot-to-flat family transition, immediate
inspection revocation before input reflection, preserved source bytes and exact
future histories. Its actual inputs and log are retained in the main proof.

The functional tests use actual Rust HTTP activation/publication controls and
the normal Wasm runtime with controlled IndexedDB, locks and image admission.
Warm transfer and interrupted local cold recovery retain seven client families,
fourteen offline document/comment lanes, three local metadata lanes, real image
acknowledgements, packet dependencies and exact future document/comment Undo/Redo.
Lost commit and publication replies are deliberate failures followed by explicit
authenticated retries. Original source data is compared before and after the
one permitted canonical shutdown checkpoint, then stays byte-identical.

Reproduce after compiling collaboration declarations and building the explicit
Native publication fixture with `node scripts/build-sdk-native-publication.mjs`:

```sh
node --test --test-concurrency=1 scripts/joint-activation-complete-native.test.mjs
node --test --test-concurrency=1 scripts/cold-joint-activation-complete-native.test.mjs
node --test --test-concurrency=1 scripts/joint-metadata-pending-control-native.test.mjs
node --test --test-concurrency=1 scripts/metadata-continuation-replacement-native.test.mjs
```

Use `node scripts/build-sdk-native-publication.mjs --release` for an optimized
fixture. The publication source and offline-installed suites both select the
binary from the build report and verify its digest.

The complete source/installed worksets, exact sources, package archives, runtime
pins, actual Native observations and prior stale-capture failures are retained
in the associated qualification record. Installation changes only module
locations in the test copies and checks distribution bytes against the producer.

This checkpoint covers controlled functional recovery. Physical storage
durability, Native process restart reassociation, the full policy/candidate
matrix, large-archive resource measurements and the historical faults remain
unqualified. All thirteen V1 release gates remain open. Versions, normal Wasm,
original protocols/defaults and public-root exports are unchanged. No push, tag,
publication or deployment is implied.

## Sealed relay restart

Use `reopen_sealed_native_restart_host` when no live handles remain. Supply the
host-selected locations for the source seal, activation checkpoint, deployment
ledger and operational room. Retain the checkpoint identity and exact current
room selection independently of those locations. The deployment ledger resolves
whether the selected checkpoint committed, including after a lost response. A
verified result holds the inactive room, its proof, the source seal, the
checkpoint and the authority for the next explicit recovery action. Missing
registrations release all of the reopened custody for retry.

If the relay crashed after acknowledging newer work and before the host
retained its exact identity, use `inspect_sealed_native_restart`. The
independently retained checkpoint is the minimum accepted archive. When
the host already retained a newer cut, provide that exact archive as the
minimum. Inspection checks the same operational owner, complete Native
history and raster bytes, then returns the surviving archive and registration
inventory and releases the reopened locks. Retain that observed selection
before reopening with all protected registrations for explicit activation.

When the active log ends inside a frame, use `inspect_sealed_native_tail`.
It applies the same host authentication, deployment epoch, retained archive
floor and original operational ownership checks. It returns the complete
surviving archive, the registration inventory at that cut, and the original
incomplete suffix with its length and SHA-256. Retain these separately from
the operating directory. Inspection leaves the active log and seal in place.
The archive can restore into a separate location.

To repair the original operating directory, retain the complete archive and
the exact suffix in separate private regular files outside that directory.
Retain the inspected state identity and suffix length and hash independently.
Call `repair_sealed_native_tail` with those files and a bootstrap that selects
the inspected state. The relay reacquires the original operational custody,
replays the selected prefix, verifies the complete archive and suffix, and
synchronizes the retained files. It removes only the incomplete suffix while
holding the deployment epoch, then synchronizes and verifies the same WAL
inode. A retry using the same retained evidence synchronizes an already
complete cut and reports `AlreadyComplete`.

After repair, use `reopen_sealed_native_restart_host` with the exact repaired
cut and all protected registrations. Preparing a new checkpoint, activating
and publishing still use the existing authenticated steps.

If the source seal, checkpoint and authority are already open, use
`open_sealed_native_restart_host` to reopen the existing operational target
and verify the retained selection. It opens only a committed
operational handoff and preserves any staged marker alias. An interrupted
handoff requires explicit operational resume. A Pending result releases the
room and raster custody so the host can retry after obtaining the missing
registration records.

A Rust host can use `PreparedLogGenerationRecoveryHost::verify_sealed_native_restart`
after reopening the operational room. Supply the independently retained
checkpoint, expected epoch and exact current server and participant identity
with fresh host authentication and the protected registration records. For a
prepared epoch the current state must equal the checkpoint. For a committed
epoch a retained descendant can carry later accepted work. The verifier checks
the actual operational owner, the complete ancestor archive, the sealed source
and the exact authority epoch. Missing registration records return Pending.

After verification, a committed restart prepares a new child checkpoint with
`prepare_durable_native_restart`. The selected deployment epoch is held during
the durable write and readback. If another claim advanced the epoch during
capture, preparation refuses before creating the checkpoint directory. After
the write releases the epoch, the host can provision fresh activation and
publication controls. Each operation rechecks current authority and custody.

The cold SDK retains the original activation intent and prepares a separate
restart intent for the selected authenticated lineage. Its publication journal
and Native activation journal use fresh storage. If either write is interrupted,
resume checks the independently retained restart choice before completing the
pair. Confirmation requests the receipt from the reopened relay under fresh
authority. The confirmed restart can continue metadata and publish. The SDK
keeps the replacement owner private until it verifies the matching publication
receipt.

Restart inspection keeps the recorded provider selection in the saved capture.
The fresh controller must prove the same seal and current cut, preserve the
ordered history, and include the exact recorded predecessor. It can select a
later predecessor if the recorded cut still appears in the verified path. The
SDK applies this rule before retaining a new intent and again before checking
the original provider receipt and bytes with newly authenticated controls.

Native activation and publication observations hold the same live approval
and custody through the IndexedDB state transaction. Losing that authority
before commit aborts the queued state write. If the write or the Native
operation already committed, the exact retained intent can be checked again
with a fresh authenticated request. The journal alone never grants authority.

The Native process fixture exits twice in each of the prepared and committed
cases. Each restart reopens the pinned archives, verifies fourteen protected
streams, and offers fresh controls for the original listener. The prepared
case retains the original checkpoint. The committed case prepares a direct
child of the last committed checkpoint after each exit.
A separate published-room case submits a document edit, a comment and a
raster through the ordinary authenticated service, then retains the
acknowledged server cut before terminating the relay. Recovery selects that
exact cut, rechecks all fourteen protected streams and uses the existing
Native ancestry check to prepare a child of the committed checkpoint. The
raster is readable through the fresh inactive recovery control. After fresh
activation and publication, a second client receives the edits and the author
can Undo and Redo both changes without losing peer work. The original
exact-checkpoint action still refuses a later cut.

A second published-room case ends the relay before it captures a snapshot of
the acknowledged work. A separate inspection process reads the surviving cut
against the last retained predecessor. The host saves that observation as the
exact restart selection. The replacement continues from the retained
predecessor, republishes the inspected bytes, and verifies the original
document and comment receipts, raster, peer catch-up and Undo/Redo.

The whole-room fixture then exercises the SDK with seven replacement owners,
fourteen offline lanes, metadata continuation, a revoked approval and lost
replies before final delivery.

Build the packages and run `node scripts/build-handover-native-activation.mjs`
to produce the exact Native fixture. Run the following from the repository root.

```sh
node --test scripts/native-sealed-handover-process-recovery.test.mjs scripts/native-sealed-published-process-recovery.test.mjs
node scripts/check-handover-native-activation-installed.mjs --sealed-process
npm run test:collaboration:sealed-joint-process-recovery
npm run test:collaboration:sealed-joint-process-recovery:installed
```

Both candidate profiles run the checkpoint cases and the full source and
installed restart workflows before the readiness audit. The installed workflow
requires a fresh report from the same source tree and pins the relay executable
used by the consumer. The report records the distinct process IDs, the matched
publication plan and the fourteen delivered lanes.

Four process tests per environment cover crash recovery. One verifies that
inspection finds acknowledged work after a crash before the host selects a new
cut. The complete activation-intent suite passed all twenty-two cases in each
environment. The record includes the integrated tree, relay executable hash and
independent package archives. [November 11 qualification](qualification/2026-11-11-sealed-relay-crash-before-snapshot.json)
