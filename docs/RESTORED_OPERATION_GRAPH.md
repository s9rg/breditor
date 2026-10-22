# Restored operation graph capture and restore

The private complete graph closes the local restore/edit/export loop. It retains
the exact incoming snapshot or lineage, the unchanged original, acknowledged
CURRENT, selected PENDING, newer unsaved LIVE and the actual whole-upload store.
Its output can be restored through the existing native source and participant
coordinators, edited, cold-reopened and captured again. It does not activate a
room, connect a provider or introduce a public restore API.

## Explicit new data contracts

`BREDITOR-RESTORED-OPERATION-STATE2` frames one restored state. It is not a
standalone complete backup: its operation identity names the exact previous
input, and the graph must supply that input. The original participant file stays
literal part zero. Native cuts, local version packets, delivery records and
upload archives keep their existing encodings.

`BREDITOR-RESTORED-OPERATION-LINEAGE2` frames a flat content-addressed part pool,
typed state entries and a single reachable ancestry chain. States are either
unchanged `snapshot-v1` headers or new `state-v2` headers. Nodes are unchanged
`lineage-v1` nodes under an explicit tag, or new `lineage-v2` nodes. Reconstruction
selects only the exact reachable subset and reproduces the previous complete
file. Each new state's operation identity must match that file's kind, selected
manifest and full byte digest. No previous whole archive is recursively nested.

All headers are closed and canonical. Duplicate or unreachable parts, missing
states, extra nodes, cycles, changed lengths and literal hash mismatches refuse.
Hashes detect corruption; they do not confer trust, permission or native ancestry.

Actual source restore selects `kind: 'lineage-v2'` explicitly. Only that kind
uses operation-plan version 2 and its separate digest domain. Snapshot/lineage V1
plan bytes, defaults and domains are unchanged. Standalone and coordinated plans
remain distinct; the coordinated plan binds all four actual database names.
The existing source/journal storage framing remains V1 with an opaque operation
identity. Old readers refuse the new input rather than migrate or overwrite it.

## Native proof before editable ownership

Envelope admission is followed by genuine read-only Rust document and comment
replays. Each state must preserve its original native source, ordered
CURRENT/PENDING/LIVE continuation, local versions and delivery progress. Each
later state must continue the previous input's LIVE. Original replay remains
historical; it is not incorrectly required to descend from that newer LIVE.

The private graph owner has an actual runtime brand, not serialized readiness.
Restored factories dispatch through captured canonical methods and normalize
only independently admitted data. No old completed recovery owner or writable
factory is fabricated from an AST, manifest or caller-supplied facade.

The actual source writer leases and prepare/commit/acknowledge journal sequence
perform bootstrap. Interrupted source and parent commits resume against retained
bytes; completed parents cannot silently adopt different inputs. Later cold
reopen preserves the actual saved descendant instead of restoring an older cut
over offline edits. Public old exporters remain closed to restored sources.

## Complete assets and independent reads

Every state's native references bind exact raster bytes. Opaque asset identities
must remain stable across the graph. Whole-upload admission conserves existing
rows, retry counters and completed storage references. Selected raster bindings
and whole-upload custody are separate: an image referenced only by an older
PENDING proposal must survive even when the latest LIVE and upload store omit it.
Capture searches genuine retained input bindings before requesting host bytes.

Capture borrows a fresh independently authorized journal read scope and binds
LIVE, selected cuts, native references and whole uploads to one unchanged actual
source stamp across awaited work. Expired writer authority or writer cancellation
does not invalidate an independently authorized read. It still forbids writes.
Reentrant source changes refuse capture; there is no implicit flush, retry,
upload or token request. Closing an archive prevents asynchronous reconstruction
from handing its input file to a caller after disposal.

## Bounds and remaining integration

The data frame reuses the existing 16 GiB lineage ceiling, 1,024-node bound and
part/header/native limits. That is not an operational large-file claim. Current
source admission uses the existing participant-bounded whole-file digest, which
materializes its bounded input. Capture refuses a ready result above that same
operational bound so its next restore cannot fail solely because capture ignored
the reader's limit. The separately bounded Rust streaming-digest V1 capability
is unchanged; larger streaming admission and memory/performance qualification
remain work.

The [selected qualification](qualification/2026-10-22-restored-graph.json) passes
29 checks from the 291-check functional plan. Source and fresh offline installed
packages repeat the same 28 focused laws, including all four document/comment
history pairs, two edited graph restores, genuine future Undo/Redo, older
input-only pixels, write-expiry reads, interrupted bootstrap and owner lifetimes.
Both run the full 640-policy graph matrix, each with 1,280 graph captures, 1,280
cold resumes and 1,920 future native history comparisons. All four existing
parent/standalone source/install restore matrices pass against the same source.

The qualification retains an actual disposal failure and its unchanged passing
regression. Input reconstruction now awaits the result and rechecks the actual
archive lifetime before returning. This repair is separate from the historical
WebKit and intermittent raster observations.

Flat storage deduplicates identical parts; it does not delta-encode every changed
native checkpoint. Current native lifetime bounds also remain: a controlled
normal-runtime diagnostic refuses insertion 1,001 in both original and segmented
histories without changing their exact recovery. Ten seals preserve all 1,000
Undo items rather than lifting that ceiling. Segmented Undo/Redo remains usable
at that boundary; a full original journal can refuse Undo. Sustainable retention
needs a separate design, not silent pruning or an increase to old limits.

Whole-room mixed-family adoption, client/provider reconciliation, independent
server review/log generations and authenticated activation remain separate
architectural work. Physical durability, large-file behavior, accessibility,
browser qualification and all V1 release gates remain unapproved.
