# Native retained asset references

Native asset-reference reads identify image bindings that a document owner can
still need after Undo, Redo or causal reconciliation. They are a prerequisite for
coordinated recovery, not an asset downloader, garbage collector or generation
rollover. Asset bytes and provider authority remain host-owned.

## Current admitted documents

`breditor_core::rich_content::inspect_rich_asset_references(&document)` returns
the unique `(asset, generation)` pairs in an admitted `RichDocument`, sorted by
native identity order. It uses the complete native image directory, including
covered table-cell content, rather than rendered image nodes. A repeated asset
with a different binding generation remains a separate pair. Opaque custom asset
identities are supported; the native model does not require SHA-256 storage IDs.
The binding generation is an image identity guard, not a room or document-storage
generation. Reading it does not implement cross-generation migration.

## Local retained history

`RichLocalSession::retained_asset_references(&observation)` unions the current
document with every retained chronological entry's before and after state,
including the Redo branch. It reads immutable states directly; it does not execute
Undo/Redo to inspect them. A discarded Redo branch or a state no longer retained
by this owner's history capacity is outside this inventory.

The exact current process-local observation is required. A stale or foreign
observation rejects. Read-only owners are supported, and a read changes neither
publication, selection, pending formats, typing continuation nor history. The
detached result is not a credential or an independently valid command source.

## Shared retained causal history

`RichReplica::retained_asset_references_guarded(&observation)` conservatively
unions the current admitted document with image bindings in complete retained
causal operations. It includes losing metadata contributions, withdrawn slots,
deleted images, undone authored births and Redo. A losing remote replacement can
be absent from every visible state observed by this writer yet become visible
after a winning local replacement is undone. Visible AST snapshots alone are
therefore not a sufficient retention inventory.

The shared Rust facade also re-exports `RichAssetReference` and the reference-count
limit, so callers can name the result without adding a separate core dependency.

The shared read follows typed native map operations and their exact metadata
container identities. It examines every metadata contribution field that native
materialization can use, including alternate fields, and extracts paired asset/
generation contributions, authored image defaults and admitted base identity
properties. It does not scan strings
that happen to resemble image JSON inside text. Causal contribution stamps and
both opaque identities are checked. Pairs
are sorted and deduplicated without combining fields from different actions.

The result can over-retain bindings from historical operations that are no longer
reachable by this writer's active Undo stack. It is deliberately not a minimal
reachability or deletion proof. Native readers never fetch bytes, author an
action, alter a journal, acknowledge an update or grant provider permissions.

## Completeness and read limits

Both local and shared results admit at most 100,000 unique binding pairs. An
overflow rejects the whole read instead of returning a prefix. The shared read
also limits work to 16,777,216 retained causal atoms, traversed in chunks of at
most 1,024 per writer. It verifies continuous exported operation spans. These
separate read policies do not increase journal, document, history or asset-store
admission limits and are not an approved V1 performance envelope.

A shared read rejects shallow history, detached/uncommitted causal state,
unknown operations, malformed metadata and incomplete retained update blobs.
Partial asset/generation writes and explicit binding-removal patches refuse
this read; the inventory does not guess a generation
from another contribution. This is a read limitation, not a change to existing
document or update admission.

The shared read also requires parent-bound native map markers for metadata
owners, their effects directory and each contribution field. Aliased containers
and inline literal metadata maps refuse completeness rather than being skipped.
Those forms can still materialize under existing native admission; their original
checkpoint and recovery behavior remains unchanged.
In particular, if a journal contains an image operation whose dependencies have
not arrived, the read must not declare the applied document's list complete.
The original pending bytes remain in native checkpoint recovery; when their
dependencies arrive, a fresh guarded inventory can succeed. A refusal neither
deletes nor acknowledges the pending work. Metadata failures use fixed diagnostic
classifications rather than returning private strings from malformed fields.

## Coordinated recovery boundary

These methods currently expose a Rust read boundary, not a Wasm/SDK/React API or
complete-room backup. They inspect native image bindings; extension-owned assets
need an explicit inventory of their own. A future coordinator must bind a captured
native source to
the corresponding inventory, include separate saved-version and suggestion/
revision/version-outbox references, reconcile pending causal dependencies, resolve
missing remote/custom bytes under current host authority, and coordinate server
and writer recovery. Asynchronous asset resolution cannot itself prove that the
document source stayed current.

The [raster archive](RICH_ASSET_BACKUPS.md) captures bytes already in one local
asset store; it does not supply those missing bindings or coordination. An
unlisted file must not be deleted on the strength of this owner-only inventory.
The approved [long-session requirement](COMPATIBILITY.md#current-bounded-lifetime)
continues to preserve Undo/Redo and outstanding offline edits across generations;
the native inventory does not implement that bridge.

The [native checkpoint](qualification/2026-10-19-native-retained-asset-references.json)
records the full Rust suites, independent native consumer, six research-manifest
contracts, two reproduced scanner repairs and installed archive regressions.
Those browser regressions cover the existing archive API, not access to these new
Rust-only reads. All V1 gates remain open.
