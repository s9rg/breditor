# Retained image reference reads

Rust and optional Wasm/SDK reads identify image bindings that a document owner can
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

## Wasm and SDK contract

`core.supportsRetainedAssetReferences()` requires the complete version-one native
capability. `core.retainedAssetReferences(revision?)` returns a deeply frozen
`RichRetainedAssetReferencesRead`: schema name/version/fingerprint, document ID,
exact decimal publication, retention scope and sorted unique asset/generation
pairs. `local-history` covers the retained local states; `shared-causal` is the
conservative shared inventory described above. Older runtimes report unavailable;
the SDK never substitutes a visible-AST scan or an asset-store listing.

The independent JSON family is `breditor/rich-retained-asset-references`, version
one, with an 8 MiB complete encoded limit. Native generation, SDK parsing, source
binding and result limits reject the whole read rather than returning a prefix.
No original document, operation, view, checkpoint or history family is widened.

`core.checkRetainedAssetReferences(read, revision?)` accepts only this live owner's
exact returned object at its current publication. Copies, JSON-parsed metadata,
foreign reads, stale publications and disposed owners reject. After asynchronous
host work, check the original read again before using it for a capture. A restored
owner derives a new read instead of adopting old serialized provenance. A
successful check covers that native publication only, not provider/server state
or outstanding JavaScript remote queues and external outboxes.

The local/shared DOM controllers forward these reads without publishing, and
reject reads/checks during composition or an operation. Managed `LocalEditor` and
`LocalDocumentEditor` expose the same methods; React's `getEditor()` returns that
same managed owner. Shared managed/durable sessions retain the methods on `core`.
Read-only owners remain readable. There is no separate editable React state,
provider fetch, storage transaction, upload, receipt acknowledgement or GC action.

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

## Saved version, proposal and revision packets

The separate native family `breditor/shared-packet-asset-references`, version one,
binds schema, document, publication, immutable packet identity and a Ready or
Pending outcome. `document_version_asset_references_guarded` admits the original
immutable snapshot and inventories its native image directory. It does not assert
that an imported snapshot's historical source is locally available or authentic;
the existing source proof remains separate.

`document_suggestion_asset_references_guarded` reconstructs the original historical
source and evaluates its original intent on a disposable native fork. It scans
conservative causal history, not only the final proposed AST: an image replaced
twice and then deleted can require both intermediate bindings. Rich inserted
drafts are included; text resembling image JSON is not interpreted as an asset.
`document_suggestion_revision_asset_references_guarded` first checks the original
lineage/source contracts and unions predecessor and replacement dependencies.
Neither read imports an operation into the live owner, changes the accepted
document or finalizes review. Missing source remains Pending with exact missing
writer ends and no reference-list property. Unsupported causal forms and complete
budgets refuse without dropping packets or changing their original admission.

Optional shared SDK methods are `supportsPacketAssetReferences()`,
`versionAssetReferences(packet, revision?)`,
`suggestionAssetReferences(packet, revision?)`,
`suggestionRevisionAssetReferences(previousPacket, revisionPacket, revision?)` and
`checkPacketAssetReferences(read, revision?)`. The capability requires all matching
native methods. Deeply frozen results have private per-owner provenance; copied,
foreign, stale and disposed-owner checks refuse. Each complete packet read is
bounded to 100,000 sorted unique binding pairs and 8 MiB encoded JSON. These
separate read budgets do not expand persisted artifact admission.

## Selected retained-source capture

`captureSharedAssetReferences({core, session?, versions?, suggestions?, revisions?})`
captures exact native checkpoint JSON plus selected existing recovery records.
`session` is the exact paired review session; `versions` can be the public
`SharedDocumentVersions` catalog; `suggestions` is the retained proposal queue;
`revisions` is its exact revision outbox and requires that proposal queue. All
sources must borrow the same native owner. The combined native/packet references
are conservative, frozen and sorted by complete pair. Its scope is explicitly
`native-and-selected-retained-packets`.

A known catalog entry without a locally cached packet yields
`{kind: "uncached_version", id}`. A proposal/revision without complete historical
source yields a `source` pending reason. Either makes the whole capture Pending,
with no references property; no empty or partial inventory is presented as Ready.
No source is flushed, downloaded, uploaded or acknowledged during this synchronous
read. Native readonly policy permits it. Admission or budget errors refuse the
capture without modifying the existing recovery data.

The capture exposes `metadata()`, exact `records()` JSON, `check()` and `dispose()`.
Call `check()` after every asynchronous byte-resolution/capture step. It rechecks
the original native read and each producer's exact export and source/lease guard;
even an outbox/catalog change that does not advance native publication invalidates
the capture. It is a process-local consistency handle, not a serialized credential.
Previously captured records remain readable after staleness for rescue; disposal
releases them and borrowed producer references without closing any source. Detached
metadata remains readable after disposal but grants no live provenance.

At most 1,024 unique packet inputs, 100,000 combined binding pairs and 160 MiB of
source JSON are admitted. The byte bound accommodates the four existing 32 MiB
record families plus the 16 MiB native journal without truncation. It is not a
performance promise. Missing bytes/provider authority, omitted stores, SDK remote
queues, extension assets and server state remain outside this capture.

The selected proposal/revision/catalog records now have separate
[dependent-store backup and restore APIs](RETAINED_STORE_BACKUPS.md). Restore the
matching native source first, then add each exact record only to an absent key.
This makes the explicitly selected records restorable; it does not coordinate
all stores, resolve their asset bytes or authenticate restored server metadata.

The separate [selected raster byte API](SELECTED_ASSET_BYTES.md) can now bind this
genuine source handle to explicit guarded host bytes and export one portable file.
Its reader still requires fresh native/component source re-admission; omitted
stores, upload-state archives and server coordination remain outside its scope.

Version catalog startup now pins its original owner and immutable configuration,
checking continuity around awaited lease/database/source-save steps. A replaced
borrowed `storage.core` refuses with `version_source_replaced`; it cannot silently
capture another owner's version while saving the old owner's journal. Raw prior
records and failed-save intent remain exportable. Restoring the original source
allows an exact retry; this does not grant cross-device writer authority.

## Coordinated recovery boundary

These methods expose an owner-only native read boundary, not complete-room backup.
They inspect native image bindings; extension-owned assets
need an explicit inventory of their own. Selected capture now binds native history
and the explicitly supplied retained packet sources, but a complete room
coordinator must still include all omitted participants, reconcile pending causal
dependencies, resolve missing remote/custom bytes under current host authority, and coordinate server
and writer recovery. Asynchronous asset resolution cannot itself prove that the
document source stayed current.

The [raster archive](RICH_ASSET_BACKUPS.md) captures bytes already in one local
asset store; it does not supply those missing bindings or coordination. An
unlisted file must not be deleted on the strength of this owner-only inventory.
The approved [long-session requirement](COMPATIBILITY.md#current-bounded-lifetime)
continues to preserve Undo/Redo and outstanding offline edits across generations;
the native inventory does not implement that bridge.

The [selected-source checkpoint](qualification/2026-10-19-selected-asset-source-capture.json)
records one frozen 37-check run, 3,243 workspace/shared Rust tests/doctests,
13 research contracts, 550 script tests and 382 editor tests. Actual Wasm and
fresh installed packages cover all 18 shared grammar/scope/history configurations,
five selected record sources, explicit Pending, exact source continuity and
future history. Pinned earlier readers match all 72 future checkpoint comparisons.
A retained negative witness reproduces the catalog source-substitution bug;
startup/live/awaited-save regressions pass after repair. Existing browser archive
regressions pass separately, not as browser qualification of this new capture API.
Three existing script checks remain skipped. All V1 gates remain open.

The [native checkpoint](qualification/2026-10-19-native-retained-asset-references.json)
records the full Rust suites, independent native consumer, six research-manifest
contracts, two reproduced scanner repairs and installed archive regressions.
Those earlier browser regressions cover the archive API, not the subsequent SDK
inventory surface. All V1 gates remain open.

The [SDK checkpoint](qualification/2026-10-19-retained-asset-references-sdk.json)
records one frozen 33-check run: full native suites, seven research contracts,
paired current/pinned-earlier history probes, fresh installed package types and
workflows, and real installed-browser inventory/asset recovery after reload.
These prove the owner-level read surface, not coordinated room capture or
cross-generation recovery.
