# Flat local operation provenance

Repeated restore/export must preserve the literal input, every earlier
original/CURRENT/PENDING/LIVE cut, later offline work, both native histories,
immutable versions, whole uploads and historical provider-only pixels. An AST
snapshot, origin reset or recursively nested operation archive does not meet
that contract.

This design has retained executable development prototypes, including a strict
typed data/shared-kernel proof. Their evidence is distinct from the later
[production-source flat family](FLAT_LOCAL_OPERATION_PARTICIPANT.md), whose
format, bounds and mandatory qualification are defined separately. Neither the
prototypes nor that private family are a public export or room activation
protocol. The original
[development record](development/2026-10-22-flat-local-operation.json) and later
[typed proof](development/2026-10-22-typed-flat-local-operation.json) keep that
distinction explicit.

## Representation

Keep one constant complete-original participant archive. Decompose the first
local-operation input into its exact framing prefix and ordered raw parts.
Content-addressed payloads retain raw native checkpoints, upload snapshots and
image bytes. Native data is never rebuilt from the final document tree.

Use append-only payload, recipe and state tables. The first recipe reconstructs
the original local-operation file. Each later recipe contains only prefix counts
and the prior root-state index. Deterministic framing plus those table/payload
prefixes reproduces the exact earlier graph file and its digest. Storing each
old cumulative header as another payload would be quadratic and is rejected as
the design, even if the image/checkpoint bytes were deduplicated.

Capture appends to the source's actual incoming graph. It must not pretend a
previously exported-but-never-imported file was that source's input. Equal raw
payloads can be shared. Native checkpoint growth itself is a separate concern;
this representation does not establish linear overall history storage.

## Admission and custody

Fresh read permission, cancellation and matching read-only factories are selected
before authority callbacks. Saved selections grant no writer, endpoint or role.
Every literal incoming file, operation plan and chronological native pair is
verified, not merely the last LIVE tree. Both histories and ordered unique
versions continue the preceding input LIVE. Native owners are reconstructed in
the reader's own runtime; native pointers never cross Wasm instances.

Every state declares precisely its native-record, whole-upload and pixel payload
uses in writer order. Correct hashes do not admit undeclared opaque additions.
Historical bindings, actual pixel identity/dimensions, attempts/epochs and
uploaded receipts remain conserved. Missing bytes remain explicit; capture does
not flush a document, retry an upload or activate a network peer.

The separate graph input kind, plan/head/intent tags and parent/journal schemas
must keep existing snapshot readers closed. Actual operational ownership still
requires the four reserved names, source/journal and whole-upload custody. First
publication selects latest admitted LIVE once under both real native writer
leases. A stored operational flag cannot recreate a missing acknowledged owner.

The final handoff conserves the exact native value/stamp and actual upload
exclusion through asynchronous releases, handle checks and cleanup callbacks.
The live source owns its input/provider independently of its retired parent.
Capturing deliberately unsaved offline work ends persistence first; a concurrent
autosave changes the cut and must cause a refusal, not a silent flush or mixed
snapshot.

## Development evidence

The isolated prototype uses actual normal Rust and a mechanically derived
four-name owner. Its 37 checks include three editable restore/export generations
and cold resumes in all four document/comment history combinations, with 36 exact
future native Undo/Redo pair comparisons. All twelve publication-interruption
boundaries cold-recover. Retained images, complete uploads and ordered versions
survive. Rehashed but invalid native chronology, upload loss, changed pixel
identity/dimensions and undeclared payloads refuse. A fresh independent Wasm
reader succeeds after writer permission and its factory retire.

Its framing experiment also checks 64 synthetic import generations. Those codec
generations are not 64 editor recoveries. The development bounds—8 MiB, 128 state
rows and 4,096 payloads—are not new shipped limits. Neither experiment fixes the
native 1,000-entry Undo or 64-generation ceilings, proves large-file performance
or certifies physical crash durability.

## Typed shared-kernel development

The later [typed development record](development/2026-10-22-typed-flat-local-operation.json)
retains 49 passing tests and two strict type fixtures. The codec/semantic reader
passes all 37 unchanged earlier assertions. Thirty-two additional codec rounds
reproduce the original development bytes exactly. Private nominal fields also
reject method-shaped data-owner DTOs at compile time; runtime ownership already
rejected them.

A separate graph registry/facade uses exactly the two production kernel/contract
modules with reversible import-only relocation, not the old sixteen-owner overlay.
All four history combinations pass three editable generations and cold resumes,
36 exact future history pairs, an independently instantiated Wasm read after
writer retirement and six abort/lost-acknowledgement publication boundaries.
Whole uploads are separately restored real stores in this shared-kernel proof;
the actual four-name graph participant and atomic handoff are not implemented.

At that development checkpoint the registry selected snapshot-v1 only. The typed proof's bounds
are development limits, not a shipping resource contract. No installed full graph
qualification, product repeated-export closure, sustainable Undo, room adoption,
activation, historical WebKit repair or V1 approval is inferred.

## Production integration order

Do not ship sixteen manually copied ownership modules. Extract a shared typed
kernel while retaining closed format facades. Each intrinsic family selects its
own input admission, plan/head/intent validators, schemas and genuine custody.
The kernel stores an unforgeable family identity on actual input/journal/opening
owners and checks it on delegation. A caller DTO or serialized readiness flag
cannot select another family or issue a child ticket. Existing snapshot entry
points must continue selecting only their original family.

Preserve concrete selection-policy types through source handoff and independent
read execution policy. Keep callback-safe final native witnesses, upload
exclusion, namespace reservation and cleanup retries on the same actual owners.
Immutable data-only payload/recipe/image admission results may be reused within
a genuine owner; permissions and native pointers may not be cached as proofs.

The separate production contract now defines the graph reader/capture and
editable journal/parent, followed by the fixed source and installed-consumer
domains and old-family regressions.
Actual room-family adoption, complete historic-copy/provider/client
reconciliation, authenticated whole-room activation and sustainable retained
Undo/offline history remain separate required work. Full parity and all V1
release gates remain open.
