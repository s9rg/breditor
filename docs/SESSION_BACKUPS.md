# Explicit session backups

Status: unpublished `0.3.0-alpha.22` browser API. No durable format or Wasm ABI
change. This is explicit recovery, not a persistence retry or conflict resolver.

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

## Public restoration contract

Pass `initialSessionCheckpointJson` instead of `initialDocument` to
`openBreditorBrowserEditor`. Keep the matching `semanticProfile`, rendering,
keyboard, and optional toolbar configuration. These startup sources are
mutually exclusive in TypeScript and checked at runtime. Imported sessions
cannot specify `persistence`; they neither read nor write IndexedDB and never
acquire a storage token. Ordinary fresh-document/persisted-slot startup is
unchanged. The options type is now a union, so application types that previously
extended the options interface should compose it by intersection instead.

Restoration uses the existing bounded Wasm bootstrap and all-or-nothing browser
owner setup. Invalid input, wrong schema/generation, invalid retained history,
or failed setup returns a redacted error and releases the reserved empty hosts.
It never falls back to a fresh document. A caller must supply a separate empty
host; this API does not replace an existing live editor.

## Recovery picker and limits

Restoration requires the matching schema/profile and explicit checkpoint
generation. The existing compiled-profile Wasm restoration factory
replay-validates every retained entry; it does not reevaluate extension intent
handlers. Tests restore typed V3 backups with a redo branch and compare their
canonical re-encoding byte-for-byte through the public browser owner. The demo
adds an explicit file picker for its exact Showcase profile. It checks the
16 MiB limit before reading, rejects invalid UTF-8, and does not strip BOMs or
repair JSON. File extensions/MIME types are hints, not validation. Rust remains
the format, schema, and replay authority.

A recovered editor opens separately with autosave disabled and an explicit
backup-download action. Another import cannot silently replace it. The
**Close recovered session** button requires confirmation; rejected or cancelled
imports leave the original editor
and saved slot untouched. Asynchronous reads are invalidated on unmount.
There is no schema migration, automatic merge, or save-over-existing workflow.
A page reload, tab close, or browser crash can still discard unsaved recovered
changes: there is no navigation guard or crash-recovery slot for this owner.
A backup does not restore IndexedDB's token or write authority. Backup files
are not encrypted, signed, or treated as trusted provenance.

Tests also cover two real tabs contending for the same storage slot: the loser
can back up typed redo history while remaining paused, and a fresh reader
still sees the winner. The recovered owner independently replays Undo/Redo and
can export again; corrupted replay history is rejected. This runs in Chromium,
Firefox, and WebKit.
