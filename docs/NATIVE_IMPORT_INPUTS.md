# Native import input retention

Accepted native operations must remain recoverable before the first selected
client changes. The private preparation path retains one complete immutable
input file under a separate namespace lease. It does not apply operations,
acknowledge source durability, adopt comments or activate a room. A durable
per-client execution journal and genuine interrupted resume are defined in the
[durable native execution contract](NATIVE_EXECUTION.md).

## Complete immutable input

The input contains the full selected current file and every original accepted
document and review page needed at the independently selected server cut. The
selected current file retains the approved baseline, complete current source
records, native histories, packet and operation journals, original upload stores
and selected upload snapshots. Neither a document AST nor a native checkpoint
alone can substitute for it.

A bounded canonical header names the exact server selection, before-file and
ordered page hashes. Archive admission checks the whole file and each entry,
re-admits the complete nested before-file, and binds its catalog identities to
the server selection. Native pages keep their original request hashes, source
policies, frames, receipts and reader roles. The first page must include the
document; continuation requests must omit it and name the preceding exact
cursor. Missing, reordered or extra pages, unfinished chains, unknown fields,
cross-selection responses and trailing bytes refuse admission.

Pages are admitted one at a time rather than retained as one large parsed
object graph. An admitted archive can read a page again with a fresh read grant.
Disposal during that read prevents successful return. This data admission does
not authenticate a saved response or make its reader role a recipient permission.

## Genuine preparation and a fresh decision

Preview and retention reserve the genuine selected owner and every actual
native facade before inspecting their new options. A brand-checked independently
configured host supplies the accepted pages; an archive cannot choose an endpoint
or credentials. Complete reconciliation reads check native forks, own-author
continuity and provider state. An incomplete selected cohort or unknown own
accepted suffix refuses before any mutation.

An intentionally unbound local comment lane remains pending. A corresponding
missing registered review actor is allowed only when the actual retained
participant has that exact principal and unbound actor. It is not marked covered,
renamed, imported into another lane or silently adopted. Other missing own
streams and server-ahead own histories refuse preparation.

The complete before-file is encoded inside its actual full read reservation.
Subsequent input hashing uses that scope's pure native hashing runtime with a
fresh grant tied to the outer recovery lifetime, not a disposed child reader.
Fresh complete record and whole-upload checks surround input collection, the
application decision and durable retention. Source or selected-upload changes
invalidate the proposed choice.

The caller independently selects the exact preview choice and supplies a new
affirmative callback for retention. A stored choice is data, never a saved grant.
The callback runs while native edits and selected asset writes remain excluded.

## Storage and failure behavior

One absent-only transaction stores the entire input record. An exact existing
retry opens and reads it without a write transaction; changed input or foreign
schema refuses without overwrite or repair. Namespace custody is independent of
the selected room. Failed queued openings retain their actual requests, handles
and leases for cleanup; cancellation cannot leave a late placeholder or input.

After preparation, the old finite grant and signal are released. Fresh verification
reads the actual schema, sole record and full file hash using a new explicit read
grant. The retained handle's file accessor supplies immutable snapshot data, not
proof that current storage is unchanged. A future executor must verify actual
retention and re-admit native/source lineage on every attempt.

A transaction may commit before cancellation or a final grant refusal is observed.
The preparation then fails, its temporary resources close, and the complete input
remains in storage. No selected client has changed. A retry still needs the exact
outside choice and a new decision. Closing the returned input handle releases
only its actual independent resources and never deletes durable data.

## Bounds and remaining execution work

The complete input, including its header and before-file, is limited to 1 GiB.
The header is limited to 16 MiB, with at most 4096 accepted pages. Each page keeps
the original 16 MiB response ceiling and original native frame limits. Oversized
complete input refuses; nothing is truncated and no existing protocol expands.

The executor retains real per-client progress and complete observed cuts,
preserves uncertain after-publication outcomes, and retires clients before
releasing exclusion after a partial failure. Cold execution reopens genuine
sources and verifies continuity from all retained cuts; older disk sources still
need explicit reconstruction. Metadata or cursors cannot skip an import or
acknowledge durability. Local-comment adoption and authenticated whole-room
activation follow full reconciliation. Sustainable history, extension parity
and all thirteen V1 release gates remain open.
