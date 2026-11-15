# Preserve competing offline branches

Two offline copies can share a document writer and comment actor while using
the same causal positions for different work. Each copy can retain its own
Undo and Redo, pending delivery, and asset state. Preserve both original
participant archives before deciding how to reconcile them.

Use `buildSharedIndependentDeliveryBranchArchive` with the independently
selected participant files and the matching read-only native factory. Both
files must have the same document and review identities, principal, and
delivery bindings. Device labels may differ. The SDK checks both complete
files and replays them privately. The returned archive contains exact copies
of the inputs, including their native generations, retained packets,
rasters, and embedded upload queues.

The comparison covers the two local author streams independently. For each
stream it reports the two positions, the last equal native prefix and its
digest, and whether the heads are equal, one copy extends the other, or the
overlapping prefixes diverge. Document positions use the packing-independent
V2 digest. Review positions use the original review digest. Equal native
heads alone leave open differences in local history partitions, pending
packets, or upload intent. The comparison carries no server acknowledgement
or current role.

Retain the returned `file` and its independent `selection` together.
`readSharedIndependentDeliveryBranchArchive` verifies the exact manifest
and file lengths, admits each original by its own selection, and recomputes
the native comparison under fresh read policy. Both original files remain
available as `current` and `incoming`. Restore either into a fresh store
with `SharedIndependentDeliveryParticipantRecovery` and independently
supplied writer credentials and current policy. Close the existing owner
before taking up the same writer identity in another session.

The archive yields two recoverable histories. Applying both independently
authored suffixes to one live room requires a separate conflict-resolution
step. The existing compatible-branch union keeps its original admission
rules.

Run the native-backed fixture after building the collaboration package.

```sh
npm --workspace @breditor/collaboration run build:candidate
node --test scripts/participant-branch-archive.test.mjs
```

For a clean offline-installed consumer check, run
`node scripts/check-participant-branch-archive.mjs` from a clean checkout
after building the package. The check packs the matching local SDK and
runs the same fixture against the workspace and the independent install.

## Compare both originals against the live relay

A host using linked segment handover can call
`ServerBackupHandle::inspect_relay_segment_participant_branches` before
choosing an original for the replacement. Supply the independently
captured predecessor cut and serving epoch, current owner authentication,
and both exact participant file pins. The inspection checks the actual
predecessor while holding its epoch and room, then privately replays each
copy under the real writer and actor registrations. It compares prefixes
in both directions, including when a client's local head is behind.

Each candidate reports the local, accepted, and compared positions for its
owned document and review streams. A conflicting owned prefix survives in
the report so the host can evaluate the other candidate. Foreign forks,
unknown registrations, invalid observer suffixes, and changed cut or
archive files refuse the inspection. Retain the complete branch archive
alongside this report. A successful comparison carries no serving
authority. Use ordinary verified handover for the chosen original to
admit receipts, check provider and asset state, and switch epochs.

Run the source and offline-installed SDK scenario with
`node scripts/check-writable-relay-segment.mjs <relay-executable> --participant-accepted-branch`.

## Retain the alternate inside the replacement

When the host wants the restored room to hold both originals, pass the
selected cohort and the corresponding alternate archives to
`RelaySegmentRoomBackupFiles::restore_with_client_journal_alternatives`.
Each alternate must be a different exact participant file for the same
registered document writer and review actor as a selected file. Supply
both cohorts in canonical owner order. For a participant with several
alternates, sort those files by ascending SHA-256 bytes. Each exact
alternate pin is retained independently within the cohort's byte and
file-count limits.

Only the selected cohort contributes to live provider checks, upload
enrollment, and the replacement's raster store. The alternate's complete
document and review histories, packets, rasters and queue stay together
inside its original archive. Verified handover compares the retained
alternate against the same accepted cut and binds it into the completion
and deployment epoch. Cold reopen checks the original archive pins before
it resumes serving. Supply the original standalone backup and retained
handover approval as in the ordinary resume flow.

A host can enumerate `client_alternate_pins` and export an exact original
through `copy_client_alternative` under local recovery ownership. The same
participant SDK can reopen that copy in an independent store without
transport. While the replacement is serving, its owner can call
`ServerBackupHandle::export_relay_segment_participant_alternates` with
the exact current epoch and an absent destination. It writes individually
openable participant files and returns their ordered pins. To move into
another handover, explicitly pass those original alternate files again.
The serving predecessor checks that the target holds each retained
original before advancing the epoch. The exact pin can be carried as an
alternate or as the selected original, subject to ordinary selected
journal and provider checks. Omitting a retained original leaves the
predecessor's epoch current. An overlapping fork still needs a
conflict-resolution step before its edits can join the live history.

The source and independently installed scenario for a second live
handover is
`node scripts/check-writable-relay-segment.mjs <relay-executable> --participant-carried-alternate`.
It advances the accepted cut after the first replacement, tries a
target that omits the alternate, then verifies the exact archive from a
fresh process after retiring the earlier room and export files.

Run `--participant-multiple-alternates` against the same fixture to
exercise two alternates for one writer and actor. Offering a new
alternate in place of a previously retained one fails the handover.
A target carrying both exact originals can resume and recover their
document and review histories independently.

## Propose selected text from a recovered original

Use `prepareSharedRecoveredBranchTextSuggestion` with one exact original
participant file, its independently retained selection, and an explicit
text range from that copy. Use scalar-aligned UTF-16 offsets. Choose a
target range and the current `targetRevision` in a live independent delivery session. The helper checks
the relay room, native seed, and schema. Native review anchors project
the archived selection to plain text, and the native proposal planner
preserves the surrounding target structure. The host reserves the
proposal namespace using its normal allocation policy, including on
refusal or discard.

The result holds an ordinary immutable suggestion packet and detached
provenance identifying the archived file and original native anchor.
Retain that provenance with the packet when the application needs an
audit trail. Use `prepareSuggestion` to preview it and `queuePacket` to
publish through the ordinary review workflow. The authenticated Accept
decision applies the proposed edit. This path imports selected plain
text. The separate archives retain their complete formatting, assets,
comments, and Undo/Redo for further recovery decisions.

The source and independently installed relay scenario is
`node scripts/check-writable-relay-segment.mjs <relay-executable> --participant-reviewed-text`.

## Propose recovered formatting or structure

Use `prepareSharedRecoveredBranchRichSuggestion` with the same verified
participant file and current target inputs. Pass a native text, node, or
grid selection as `sourceSelection`. Native clipboard semantics preserve
inline marks, selected structure, and the selected portion of tables
and captions. Destination IDs are freshly allocated from the host's
reserved namespace. The ordinary suggestion preview validates the
complete edit against the target and supplies the data for review.

For each copied image, the result includes the original binding, the
fresh destination binding, its independently verified content asset,
and the exact original Blob. Resolve the fresh binding through your
existing provider or content-addressed upload before publishing or
accepting the packet. Preserve the returned original provenance with
the packet if the application needs an audit trail. Preparation leaves
publication and acceptance to the ordinary review lane.

The source and installed fixture for a rich proposal after two handovers is
`node scripts/check-writable-relay-segment.mjs <relay-executable> --participant-multiple-rich-review`.

## Open a new read-only client after handover

An application can start a new Reader with its current account token and the
active room endpoint. Register the suggestion observer, then register a
read-only review actor against that same observation-only document writer.
Discover the version catalog with `discoverSharedDocumentVersions` and the
revision lane with `discoverSharedSuggestionRevisions`. The revision helper
takes the nonsecret suggestion queue identity and checks the authenticated
revision descriptor against the selected suggestion room. It allocates no
writer and returns only the binding. Reconnecting still requires current
authentication and an exact descriptor match.

Use these bindings with a fresh `SharedIndependentDeliverySession`. Join the
document from the registered observer frame, connect the suggestion and review
transports, and retrieve versions through the ordinary catalog. Keep the
observer and review credentials in protected application storage. The Reader
can reopen its own local history after initial sync. The original participant
archive stays with its recovery owner.

Run `node scripts/check-writable-relay-segment.mjs <relay-executable>
--participant-cold-review-reader` to exercise a Reader first registered after two
handovers and a relay restart.

## Inspect and recover an archived comment

Use `readSharedRecoveredBranchReview` to find threads and original anchor
status, including hidden threads, in an exact participant archive. Pass the
chosen birth identity to `readSharedRecoveredBranchReviewThread`. Follow
`nextOffset` to read further pages from that
same archive. The native reader returns each original event's account,
identity, digest, and literal action or visibility change. It includes hidden
births, retracted messages, edits, replies, anchor changes and Undo/Redo. The
same actor and counter can describe different original events in two archives.
Keep the particular archive selection and event digest with the selected
message.

Use `prepareSharedRecoveredBranchReviewMessage` with the chosen event key,
the current live review snapshot, and an explicit destination. Choose a new
thread anchored to a current document target, or a reply to a selected live
thread. Creation, reply, and edit bodies can be selected. The original event
author must match the live account. Preparation reads the archive again,
checks the original native document and review room, and leaves both owners
untouched.

Call the prepared result's `commit()` to issue one ordinary native comment.
The exact live document and review observations must still match. The new
comment has a fresh identity and follows ordinary comment Undo/Redo and
authenticated delivery. Retain the returned source reference with that new
identity for an application audit trail. The prepared command is bound to
the current session and can commit once. A new request after a restart is a
new authoring decision. Historical edits, retractions and state decisions
remain in the original archive. Messages by other authors can be read and
inspected there.

Run `node scripts/check-writable-relay-segment.mjs <relay-executable>
--participant-recovered-comment` for the authenticated workflow through two
handovers, relay restart and a fresh read-only client.

## Resume a retained comment recovery intent

Use `prepareSharedRecoveredBranchReviewIntent` when the application needs
to recover a submission whose outcome is uncertain after restart. Retain the
returned `intent`, the exact source archive and the original destination
selection in host storage before calling `commit()`. The native preview
admits the action without changing either owner and computes the exact
future event digest. Commit uses the ordinary comment action and its usual
Undo/Redo rules. It stages the action again and checks the predicted digest
before changing the live review history.

After reopening the original delivery session, pass the saved intent to
`inspectSharedRecoveredBranchReviewIntent`. Its outcomes are:

- `unapplied` means the original authored prefix is present and the planned
  counter is still unused. To retry, prepare with the original archive,
  event, destination, a fresh live guard, and the saved intent as the second
  argument. It must match the exact native candidate, including its anchor
  and causal dependencies.
- `local` means the planned event is already in the native owner. Continue
  ordinary authenticated review synchronization. A newly reopened owner
  reads its persisted history. A live owner may still be saving.
- `acknowledged` means the saved relay progress covers the exact event.
  Reconnection can recover this outcome from the relay's verified actor
  prefix even after a durable reply was lost.
- `conflict` identifies a different predecessor or a different event at the
  planned counter. Keep the original intent for inspection.

The intent contains no account credentials. It records a chosen operation
and its native lineage, separate from a freshly authenticated relay receipt.
The application associates the intent's original event with the resulting
live identity. The existing same-session comment helper remains available
for older runtimes.

Run `node scripts/check-writable-relay-segment.mjs <relay-executable>
--participant-recovered-comment-intent` to exercise a relay restart after a
durable review reply was dropped at the client.

## Continue a whole archived discussion

Use `prepareSharedRecoveredDiscussion` with a chosen thread in an exact
participant archive, a current review guard, and a live anchor. Supply the
current account's own text for the new discussion link. The SDK reads all
pages of the archived native thread and makes one selected attachment with
its projected state, original author identities, individual versions, and
complete event timeline. The attachment leaves unrelated discussions,
participant credentials, document snapshots, and raster payloads in their
original stores.

Retain the returned file, its independently selected digest and byte length,
and the recovery intent in host storage. Then call `commit()` for the ordinary
live discussion under current permissions. Its exact future birth is part of
the attachment. Use the shared review intent inspection after restart and
pass the retained intent when retrying the same operation. Replies to the
live discussion use the ordinary review lane under the replying accounts.

The application decides who can receive the selected attachment and provides
the file and independently retained selection to authorized readers.
`readSharedRecoveredDiscussion` verifies the file against that selection
under the host read policy and checks the selected room,
native document seed, and exact original birth of the live link. Native
author attribution comes from the original archive at capture. The Reader
uses the attachment alone and its own live review history to open it.
Historical messages and Undo/Redo remain in the original archive. The relay
persists the ordinary link event. The host supplies attachment storage and
discovery across sessions. A complete attachment must fit the existing JSON
room-record byte and shape limits. The SDK refuses oversized attachments.

Run `node scripts/check-writable-relay-segment.mjs <relay-executable>
--participant-recovered-discussion` to exercise two authenticated authors,
their archived history, two handovers, relay restart, and a new read-only
client.

### Publish a recovered discussion in the relay

A recovered-segment room owner can publish the exact prepared attachment after
the new live review thread has been durably acknowledged. Call
`publishSharedRecoveredDiscussion(file, selection, archiveSha256, options)`
with the **whole-file** lowercase SHA-256 of the retained alternate participant
archive. It must match the original archive digest within the prepared packet.
Keep the prepared file, intent and original whole-file pin until the
publication receipt is obtained. Exact retries return the original sequence
and file pin. A different file or source pin cannot replace an attachment.

The reference relay verifies the current room, review binding and native seed,
the accepted live creation event and its owner, and the complete projection and
ordered native events in the retained alternate. It appends the verified exact
bytes before making the attachment discoverable. The immutable attachment is
included in materialized room checkpoints and may be discovered after handover
under the existing room Reader permission. Its content follows the same
room-wide read policy as an ordinary review thread. Publication explicitly
shares the complete selected historical discussion, including hidden actions.

Call `discoverSharedRecoveredDiscussion(thread, options)` with the current live
thread ID. It returns the exact file pin or `null`. Pass the returned entry to
`loadSharedRecoveredDiscussion(entry, options)` after review catch-up. Loading
checks the returned bytes, the local native room and the original live link.
The SDK uses the independent delivery session's registered review endpoint and
principal with an explicit account token provider. It sends no actor or resume
credential through the attachment transport.

The reference endpoints are GET and POST
`/recovered-discussions/v1/threads/{actor}/{counter}` and GET
`/recovered-discussions/v1/threads/{actor}/{counter}/file`. All requests use
the relay's exact Origin and account headers plus `X-Breditor-Review`. POST
also sends `X-Breditor-Archive` and the original
`application/vnd.breditor.recovered-discussion+json` body. GET discovery returns
a versioned entry with the link, acceptance sequence, byte count and SHA-256.
The reference catalog bounds each attachment at 8 MiB and the room at 64 MiB
and 4,096 attachments. A relay opening a cut that contains a published
attachment needs the recovered-discussion WAL and checkpoint readers.
Application-managed attachment storage remains available through the
prepare/read APIs.

Run `node scripts/check-writable-relay-segment.mjs <relay-executable>
--participant-relay-discussion` for source and clean installed test coverage
through an authenticated handover, a relay restart and a new read-only client.

Current native owners can read the selected discussion's projection and
complete attributed timeline together. They order the retained events once and
project only the selected thread. Publication verifies the prepared file with
the same native traversal. A direct birth read checks live links without
ordering the whole history during publication, checkpoint restoration, or
attachment opening. Compatible older Wasm owners use the existing guarded page
API. Both paths produce the same attachment format, bytes and intent for the
same observed source and destination.

The relay captures the approved participant registrations and immutable profile
in a serving transaction. A bounded worker then reads, restores and verifies the
original archive outside the room and deployment locks. Other room operations
and an authenticated handover can continue during that work. To publish, the
relay reacquires the serving epoch and file custody, checks the exact live birth
and current accepted writer prefixes, and appends the same verified packet.
Exact retries still return the original acceptance. The worker retains its quota
until it finishes, including when a client disconnects during verification.
Attachment reads have their own quota.

### Preserve published discussion sources in portable room backups

Keep the original participant files referenced by published attachments along
with the portable room backup. Read the exact, deduplicated whole-file digests
from `RelaySegmentRoomBackupFiles::required_recovered_discussion_sources`.
While the serving epoch is current, pass that list to
`ServerBackupHandle::export_relay_segment_recovered_discussion_sources` under
owner authentication. The export returns original pins and numbered files in
digest order. It can find a file that moved from the alternate cohort to the
selected cohort, and it verifies the exported bytes against their original pin.

Supply those originals with the selected and alternate client journal inputs
when restoring the backup. Every published source must have its exact digest
in one of those cohorts. The portable restore checks this before creating the
destination. Cold reopen also checks attachments accepted in the later WAL.
The live predecessor stays selected when a restore omits a required source.

For a single capture, call
`ServerBackupHandle::capture_relay_segment_with_discussion_sources`. The
handle takes the archive dependency list at the exact native and raster
cut. It copies and syncs the originals in `discussion-sources` under the
same serving epoch while releasing the room lock for other operations.
Retain the returned `RelaySegmentDiscussionBackupIdentity` independently
of the directory.

`RelaySegmentDiscussionBackup::open` checks the native archive, checkpoint,
rasters and original participant files against that identity. For a linked
capture, supply the previously verified native parent. A missing original
or an incomplete pin roster fails admission. Add the verified originals to
the normal selected or alternate inputs for restore. Other participant
journals and upload inputs follow the existing verified handover contract.
