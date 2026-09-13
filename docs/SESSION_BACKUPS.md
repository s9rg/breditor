# Explicit session backups

Status: unpublished `0.3.0-alpha.21` browser API. No durable format or Wasm ABI
change. This is recovery export, not a persistence retry or conflict resolver.

## Export contract

Call `editor.exportContent("sessionCheckpointJson")` explicitly to copy the
bounded, canonical Session Checkpoint generation selected at bootstrap:
legacy V1, property-free profile V2, or typed profile V3. The result uses the
same frozen export envelope as the other formats: `format`, `value`, UTF-8
byte count, and the exact lineage/revision snapshot. It never infers a format
from supplied bytes or falls back to another generation.

Unlike `documentJson` and `plainText`, this export includes selection, pending
formats, Undo/Redo history, and potentially deleted text. Treat it as sensitive
session data, not a shareable document. Existing export modes are unchanged
and do not silently gain history. The checkpoint also is not a UI draft backup:
unfinished IME composition and unsent toolbar drafts are not included.

The public owner uses the adapter's privately registered checkpoint read port,
not a mutable public property lookup. The read uses the existing exclusive
Wasm checkpoint lease and bounded, profile-correlated decoder, frees temporary
handles, and checks before/after snapshots and disposal. Busy composition,
delivery, or another read yields `content_export.busy`; unavailable, malformed,
and core failures use the existing payload-redacted export errors. There is
no empty-checkpoint fallback. Malformed or reentrantly disposed reads release
no provisional bytes to the caller.

Export does not wait for IndexedDB, change a CAS token, flush or retry storage,
clear dirtiness, resolve a pending write, or mutate history. It is available
while persistence is disabled or paused if the engine can be read safely.

## React recovery UI

When autosave pauses, the demo offers **Download session backup** and explains
that the file includes deleted history. A click captures the current session,
requests a local JSON download, and releases its temporary object URL and DOM
node. It does not contact a server. The status says only that a download was
requested: the user must verify that their browser actually saved the file.
Autosave remains paused and its original failure remains visible.

Keep the original editor open until the backup is secured. A busy or failed
export produces a fixed message without including session text or exceptions.
The ordinary **Retry saving** action retains its old token and still cannot
overwrite another tab's winning save. Backup is not an implicit merge.

## Restoration and limits

Restoration requires the matching schema/profile and explicit checkpoint
generation. The existing compiled-profile Wasm restoration factory
replay-validates every retained entry; it does not reevaluate extension intent
handlers. Tests restore typed V3 backups with a redo branch and compare their
canonical re-encoding byte-for-byte. No new import picker, public-browser
checkpoint-startup option, automatic replacement, or schema migration is
introduced here. A backup does not restore IndexedDB's token or write authority.

Tests also cover two real tabs contending for the same storage slot: the loser
can back up typed redo history while remaining paused, and a fresh reader
still sees the winner. This runs in Chromium, Firefox, and WebKit.
