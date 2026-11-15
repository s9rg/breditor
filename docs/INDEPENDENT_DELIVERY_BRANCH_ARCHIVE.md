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
both cohorts in canonical owner order. This supports one alternate per
selected participant.

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
another handover, explicitly pass those original alternate files again. An overlapping fork still needs a conflict-resolution step before
its edits can join the live history.

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
