# Portable local operation capture and reading

The private local operation archive preserves the literal original participant
file, acknowledged and pending native save cuts, newer unsaved native work,
immutable versions, the whole upload store and every selected image payload.
Capture does not flush, retry a save, acquire an author or activate a server.
The existing complete-local and delivery formats keep their meanings.

## File identity and native state

The new binary frame uses the local-operation magic and MIME type. A separately
selected original participant and manifest digest bind a canonical closed header
and ordered payloads. Each payload has its own length, offset and digest. Header
size is bounded before decoding, payload ranges before reading, and collection
counts before cloning their values. The original file remains literal rather
than being reconstructed from the final document tree.

The manifest retains the actual local journal identity and intent, the observed
source cut, CURRENT and PENDING cuts, and LIVE document/comment/version records.
Native JSON stays opaque and exact. Reading replays ORIGINAL, CURRENT, PENDING
and LIVE through real temporary read-only Rust owners. Each later state must
continue both native histories; a common ancestor or matching final tree does
not prove that order. Versions have unique native IDs and preserve the preceding
ordered catalog as an exact prefix. Digests establish neither native continuity
nor permission.

## Image and upload conservation

References cover retained native histories and immutable version packets in
every selected state. Missing dependencies produce explicit Pending results.
Capture resolves pixels from the actual whole upload snapshot, then the retained
original provider, then an explicitly selected host resolver. Resolver guards
must remain current and synchronous. The same globally immutable asset cannot
be rebound to different pixels by changing its generation label.

Reading validates payloads through ordinary raster admission and checks the
complete reference set. Original bindings retain their content and identity
policy. Original upload rows, dimensions and uploaded receipts must survive;
attempts and epochs cannot move backward. Provider-only pixels remain separate
from upload jobs. The archive does not enqueue or perform a network upload.

## Read authorization and ownership

The host supplies fresh synchronous read authority, cancellation, limits and
explicit read-only native factories. Names and factories are snapshotted before
the first authority callback. Invalid optional values refuse rather than silently
selecting defaults. Historical files and expired writer grants choose none of
these permissions.

Capture borrows the genuine source-owned journal and native lifetime while
checking the actual managed source stamp. The source can remain readable after
its write grant or write signal ends. A separate ended read grant still refuses.
Actual source close waits for a pending read and its native cleanup; a failed
capture releases that read scope for retry. Factory rejection frees only fresh,
unclaimed native results, never another editor's already-owned Rust object.

The returned archive owns its separately admitted original, uploads and payloads.
Caller facade replacements and serialized readiness flags do not establish that
ownership. Disposal closes that owner; previously returned immutable Blob values
remain caller-owned data.

## Editable restore remains separate

This format supplies complete capture and read admission, not a complete editable
operational restore. A raw native-payload replay can verify future Undo/Redo, but
does not adopt the incoming journal, upload store or provider provenance.

Editable restore must retain the genuine incoming archive and publish verified
input LIVE through durable prepare/save/acknowledge recovery under one actual
native writer lease. Earlier selected cuts remain literal incoming provenance,
not newly published edits. Later writes must continue input LIVE, with bounded,
flat provenance preserved through cold reopen and repeated export.
Resetting to the historical original, manufacturing a delivery companion, or
silently upgrading an old local capture does not satisfy that contract.

The [restored-local journal](RESTORED_LOCAL_OPERATION_JOURNAL.md) now implements
native publication and cold recovery separately. Complete operational upload
ownership and repeated flat export remain required.

Five-family room adoption, every historic-copy/provider/client reconciliation,
fresh authenticated activation, sustainable native history and V1 qualification
remain separate requirements. Existing native and archive limits stay unchanged.

The [selected qualification](qualification/2026-10-22-independent-local-operation-portable.json)
pins the tested source and exact retained artifacts. Source and fresh installed
packages each pass 40 focused laws and all 480 native cases, including 1,440
future native-payload history comparisons. All 26 selected checks pass; the entire
320-check plan, complete editable operational restore and V1 approval remain open.
