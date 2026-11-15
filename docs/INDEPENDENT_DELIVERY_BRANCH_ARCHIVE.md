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
