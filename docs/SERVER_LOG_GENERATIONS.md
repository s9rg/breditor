# Server log generations

Breditor's reference host has a separate, opt-in Unix storage layout for retained
server log files. Physical rotation preserves global event positions and native
histories. It does not compact history, migrate an existing live room, complete
multi-file backup/restore, or qualify this layout for production deployment.

## Explicit selection and bounds

`Room::create_log_generations` selects legacy writer transport;
`Room::create_atomic_log_generations_v2` selects atom-lineage transport. Each
requires the exact original native compiler and two distinct generation IDs.
Native validation precedes creating an absent private directory.
`Room::open_log_generations` is its only room reader. Original constructors,
framing and backup formats keep their meanings and limits. Every new generation
file, including the sequence-zero seed, uses explicitly selected continuation
framing. The original reader rejects these bytes even when a root is copied
outside its directory. No path-based heuristic or rewrite of an existing
original room log provides this separation.

This layout retains at most 64 WAL files including its original root and current
active file, and 512 MiB of WAL bytes in total. Each file retains the original
4,096-record and 256 MiB ceilings; a record retains its 20 MiB ceiling. Controls
are canonical, versioned JSON, at most 128 KiB each and 8 MiB for the immutable
manifest lineage. These are finite retained-lifetime bounds, not a pruning policy
or a change to the separate native Undo-item and journal limits.

## Physical ownership and rotation

The host owns a private directory and an exclusively locked instance marker.
Content-addressed immutable manifests retain every closed file's exact byte
digest, global cut and predecessor. A separate physical head selects one
manifest; readiness pins the initial manifest. A descriptor is detached metadata,
not account authentication, a backup, or deployment authority.

Only the current owner can request `rotate_log_generation`. A nonempty active
file seals without appending a semantic event. Exact lifetime-ID retries return
their original physical receipt even after later heads and cold recovery.
Full active files rotate automatically through the same path. A two-record
suggestion revision remains globally adjacent across the physical boundary.

Rotation syncs an owned empty continuation and a durable intent before linking
its final name, publishing the immutable manifest, and replacing the head. The
intent binds the actual staged inode, so cold resume cannot adopt an unrelated
occupied continuation, even if it is empty. Normal cleanup removes only the
intent's exact owned aliases. Bounded unpublished stages are retained, never
silently admitted as history or scavenged. Unknown directory contents refuse.

Live guards check held inodes, path custody, lengths, controls and filesystem
change witnesses. A detected change permanently fences that owner until cold
recovery. Change witnesses are not portable identities or cryptographic proof;
cold opening verifies exact closed-file digests and all framing, then replays
the native room before completing an intent or trimming an incomplete active
tail. Rotation additionally rehashes the retained closed files and manifests.

## Recovery and release work

The layout requires a cooperative local Unix filesystem with working locks,
hard links, atomic rename and file/directory sync. A private directory lease is
not cross-device fencing. Physical power-loss and other-host qualification stay
open. Failed initial creation may leave an unready private directory; use a new
destination rather than overwriting it.

The current original-only backup, participant and joined raster-recovery readers
refuse this layout. The next step is a complete multi-file archive and insert-only
resumable restore with an independently trusted source cut and readiness only
after native replay. Matching asset/provider closure and authenticated whole-room
activation follow; no archive can grant a second live deployment authority.

The functional regressions use the actual native room and filesystem. They cover
all ten profile/transport choices, two manual cuts, two automatic capacity cuts,
eight interrupted rotation prefixes, native offline edits and future Undo/Redo,
exact historical retries, revision adjacency, and non-mutating refusal of forged
or occupied recovery targets. These controlled prefixes are not physical
power-loss certification.

The [storage qualification](qualification/2026-10-21-server-log-generations.json)
passes 251 relay, 142 no-networking and 1,331 script cases on frozen source, with
three existing opt-in skips. Four positive before-failure assertions remain
unchanged. Exact non-relay inputs and normal runtime/package bytes carry the
prior core qualification; core suites and Wasm producers are not rerun here.
