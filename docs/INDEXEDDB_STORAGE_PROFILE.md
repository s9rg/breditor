# IndexedDB local-log storage profile

Status: profile contract frozen in Breditor `0.0.33`; pure-Rust root/selection
values implemented in `0.0.34`; exact selected identity-envelope retention and
comparison implemented in `0.0.35`; exact non-owning attempt plans and
`Prepared`/`Uncertain` mechanics implemented in `0.0.36`; process-local exact
physical-attempt terminal attestations implemented in `0.0.37`; no
IndexedDB/JavaScript/Wasm adapter, serialized resolver evidence, restart plan
reconstruction, ownership typestate, or executable provisioning exists

Profile identifier: `breditor/indexeddb-local-log`

Profile version: `1`

IndexedDB database name: `breditor-local-log-v1`

IndexedDB database version: `1`

Compatibility status: unstable pre-`0.1` profile; no permanent promise

This document freezes one correctness-first browser profile for the
platform-neutral storage-generation contract. It is deliberately concrete:
there is one database, five object stores, one transaction scope, one initial
selection format, and explicit terminal and recovery classifications. It does
not claim that browser storage has native-filesystem semantics.

The profile is based on the current
[IndexedDB 3.0 transaction model](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
and the [Storage Standard](https://storage.spec.whatwg.org/). IndexedDB 3.0 is
a Working Draft, while the Storage Standard is a living standard. A profile
implementation must be tested against the browsers it declares supported; the
documented semantics are necessary contract conditions, not an assertion that
every browser implementation is bug-free.

## Decisions

Version `0.0.33` freezes these decisions; versions `0.0.34` through `0.0.37`
implement only their profile-independent Rust value/attempt subset:

1. Initial provisioning uses a distinct canonical root-selection value. It
   does not invent a magic expected head or pass an unchecked ordinary
   rotation manifest through a public constructor.
2. A trusted selected root is an O(1) current-state summary. Restart does not
   walk a predecessor-manifest chain, so selection payloads older than the
   immediate predecessor and retired generation bytes can be reclaimed.
3. One scope incarnation has exactly one mutable control/head record and
   append-only transaction, head, and generation identities. Identifiers are
   never recycled; a unique head index and retained identity tombstones make
   the profile check executable rather than aspirational.
4. Provisioning, rotation publication, active-generation retirement, and the
   new empty-generation reservation are one IndexedDB `readwrite` transaction.
5. Request success is not commit evidence. Only an exact publication-armed
   transaction's `complete` event can be host-attested as historical commit for
   its associated attempt ID. A bare `complete` event from another branch or
   transaction is insufficient. `abort` attests rollback of that physical
   transaction only; another copied or serialized dispatch may already be
   committing the same plan when its event handler runs.
6. A missing terminal event is `Uncertain`. A later overlapping `readwrite`
   transaction resolves it from the database and scope incarnations, immutable
   transaction identity record, current head, and current exact selection.
7. The current and immediately preceding transaction records retain complete
   canonical selection bytes. A later rotation reduces the older record to an
   identity-only tombstone. A late exact retry of a retired record fails closed
   instead of pretending byte identity can still be proved.
8. Generation metadata becomes a permanent identity tombstone. Retired payload
   chunks may be reclaimed independently without making an old generation ID
   fresh again.
9. Every profile operation uses the same five-store transaction scope. This is
   correctness-first and serializes writes across otherwise unrelated editor
   scopes. The performance limitation is explicit.
10. Transactions request `durability: "strict"`, but IndexedDB defines
    durability as a hint. `complete` means profile-committed, not immortal,
    `fsync`-equivalent, eviction-proof, or rollback-protected.
11. The immutable selection `fenceId` records activation history. Mutable writer
    authority uses a separate nonwrapping writer epoch and current writer-fence
    ID in the scope control record. Every active-generation mutation and
    rotation rechecks both; retired-payload cleanup is separately serialized.
    Pure IndexedDB V1 does not claim a stable lock between transactions.

## Authority split

`breditor-core` remains synchronous, deterministic, and free of browser
handles. Versions `0.0.34` through `0.0.37` can:

- prepare and strictly encode the root-selection value from one borrowed local
  log compaction outcome;
- strictly decode root and ordinary-rotation selections;
- normalize either selection kind into one selected root that retains its
  complete checked selected binding and exact current/optional-predecessor
  canonical selection bytes;
- expose borrowed current/predecessor receipt bindings and byte lengths while
  keeping direct raw-selection access core-private, and publicly compare
  caller-supplied exact envelope bytes;
- validate a proposed ordinary rotation against that summary through distinct
  `prepare_rotation_from_selected`, `encode_rotation_from_selected`, and
  `decode_rotation_from_selected` actions;
- close one checked root plus explicit database/planned-scope incarnations, or
  one checked rotation plus its normalized selected root, into a non-`Clone`
  exact `Prepared` plan with a full prospective candidate binding and exact
  candidate JSON; a rotation snapshots the complete prior selected binding and
  `Arc`-shares exact selected current/optional-predecessor JSON without
  retaining the selected root or anchor; and
- conservatively begin `Uncertain` under a fresh core-issued ABA-safe process-
  local attempt ID, expose one borrowed exact request, reject cross-plan/stale
  IDs without classification, and exactly resubmit the same retained plan and
  bytes under a fresh ID; and
- consume one matching `LocalLogStorageAttemptTerminalAttestation`, yielding
  host-attested historical commit or a retained physical `AttemptAborted`/
  `NotAttempted` state, with recoverable rejection and exact resubmission from
  either negative state; publication-completed and transaction-aborted
  attestations require the exact opaque request ID emitted by the request.

The v0.0.37 boundary checks typed host terminal evidence against one exact
prepared plan without treating per-transaction IndexedDB fencing as release of
an exclusive semantic owner. Typed serialized resolver evidence is deferred to
v0.0.38.

The JavaScript adapter owns `IDBDatabase`, `IDBTransaction`, requests, events,
connection reopening, exact key construction, structured-clone values, and the
unpersisted writer capability. It must prepare all Rust/Wasm bytes before
opening a publication transaction. In the transaction-creation task it enqueues
every independent validation read and tracks their pending count. A read event
may synchronously enqueue a dependent read. Inside the active success callback
that reduces the pending count to zero, the adapter compares every collected
fact and synchronously enqueues every mutation request or aborts. No promise,
fetch, timer, arbitrary application callback, or return to the event loop may
sit between the final validation result and those writes. IndexedDB makes a
transaction inactive outside its creation task and request-event dispatches.

The Wasm boundary, when added, carries owned UTF-8 byte buffers and bounded
scalar facts. It does not make an `IDBTransaction` a Rust value, keep a browser
request alive, or turn a JavaScript promise into storage authority.

The host coordinator still chooses lifetime-fresh identifiers and owns the
writer-capability allocator. A selection's persisted `fenceId` becomes the
generation's immutable `activatedFenceId`. The scope control separately keeps
`writerEpoch` and `currentWriterFenceId`; a revocable writer token names their
exact values. All are non-secret correlation data. Knowing or copying them is
not a capability, browser lock, authorization token, or proof that an old
writer was stopped.

## Canonical initial root selection

The initial value has format name `breditor/local-log-storage-root` and format
version `1`. It is a strict compact UTF-8 JSON object with fields emitted in
the following order:

```json
{"format":"breditor/local-log-storage-root","formatVersion":1,"profileId":"breditor/indexeddb-local-log","profileVersion":1,"scopeId":"scope:example","transactionId":"transaction:root","committedHeadId":"head:root","fenceId":"fence:root","sessionId":"session:example","checkpointLogId":"log:genesis","activeLogId":"log:active","activeFrame":{"formatVersion":1,"maxPayloadBytes":"8192"},"checkpointJson":"{...canonical Local Log Checkpoint V1 JSON...}"}
```

The root contains no `expectedHeadId`, `acceptedPrefixBytes`, or sealed-frame
claim. There is no authoritative prior head and no previously persisted tail
whose accepted prefix needs to be selected. Its fields mean:

- `transactionId` is the lifetime-fresh provisioning transaction identity;
- `committedHeadId` is the first authoritative head;
- `checkpointLogId` and `activeLogId` are the distinct checkpoint and successor
  generations inside the nested Checkpoint V1 value;
- `activeFrame` is the policy fixed before the first stored active-tail byte;
  and
- `checkpointJson` is exact canonical Local Log Checkpoint V1 JSON.

The implemented `prepare_root` action borrows a
`LocalLogTailCompactionOutcome`, derives both log IDs, session ID, and exact
checkpoint JSON from it, and takes only the profile/scope, transaction/head,
fence, and active-frame choices from a separately supplied binding and caller
inputs. Those values are not storage authority. The action does not
consume or release the compaction outcome and carries no abandonment authority.
It proves and fixes one candidate value only; `encode_root` separately emits
canonical bytes. A separate host decision may propose
that the committed root supersede the pre-root tail; actually quarantining or
abandoning the old owner remains blocked on future consuming typestate. The
accepted-prefix length and old frame policy are intentionally not claimed as
persisted facts. The complete checkpoint may contain imported content, history,
and replay tombstones. “Root” means first authority in this storage incarnation,
not an empty semantic session. The value has no public unchecked constructor
and does not itself provision storage.

Strict root decode must enforce the same bounded identifier grammar as the
ordinary manifest, exact format/profile versions, distinct log identities,
exact frame shape, independent complete-input/complete-output/checkpoint
limits, canonical nested Checkpoint V1 JSON, and byte-for-byte canonical outer
JSON. The nested checkpoint binding must equal `sessionId`, `checkpointLogId`,
and `activeLogId`.

## Trusted selected root

Restart selection is separate from ordinary edge validation. In one fixed
transaction, the adapter builds a full profile-attestation envelope from:

- the exact meta/database incarnation and scope control;
- the selected transaction key, every immutable value field, and exact
  selection JSON;
- the immediate-predecessor transaction key, immutable fields, and exact JSON
  when the control names one;
- the complete selected checkpoint and active generation records; and
- the mutable writer epoch and current writer fence from the control.

That complete profile-attestation envelope is validation input. The normalized
Rust result retains only its immutable selected binding, the byte-exact current/
optional-predecessor selection JSON, and its decoded current checkpoint anchor;
it does not retain the scope control, complete generation records as browser
values, mutable writer envelope, or browser handles. Browser records remain
adapter-owned structured-clone values. The adapter supplies their bounded
scalar facts and exact JSON to Rust; it does not parse selection JSON in
JavaScript and then trust fields derived from that same candidate.
Rust strict-decodes the selected JSON against a binding that independently
fixes the profile/version, database and scope incarnations, scope,
transaction, expected head, committed head, selection kind, and session. It
strict-decodes the named predecessor JSON against an equally complete receipt
binding when present. The mutable writer epoch/fence is validated by the
adapter but deliberately excluded from the selected Rust binding and result;
it belongs only to a separately acquired revocable writer token. Candidate
JSON can never select its own authority.

Strict selected decode accepts either:

- one root-selection value whose `committedHeadId` is the selected head; or
- one ordinary storage-generation value whose `committedHeadId` is the
  selected head.

Both normalize to the same logical shape. The decoded checkpoint anchor and
exact selected identity envelope are privately retained inside a non-`Clone`
selected value; the anchor is not returned as a public
`LocalLogCheckpointAnchor` because that existing type can directly open a
writable successor:

```text
profile + version
database incarnation + scope + scope incarnation (trusted profile envelope)
selected head + previous head (null for root) + selection kind + transaction
complete current selection receipt binding
optional complete immediate-predecessor receipt binding
byte-exact canonical current selection
optional byte-exact canonical immediate-predecessor selection
immutable activation-fence correlation ID
session
checkpoint generation + exact checkpoint JSON
active generation + active Frame V1 policy
```

For an ordinary rotation, `sealedLogId` becomes the checkpoint generation and
`successorLogId` becomes the active generation. For a root, the corresponding
fields are `checkpointLogId` and `activeLogId`.

For a selected root, the bound/decoded expected head and predecessor are both
null. For a selected ordinary rotation, the current decoded expected head must
equal the bound predecessor receipt's committed head. The predecessor's
decoded active log and Frame V1 policy must equal the current checkpoint
generation and sealed-frame facts, and its decoded activation fence must equal
that retired generation's `activatedFenceId`. The current and predecessor
transaction keys, value identities, decoded identities, and control links must
all agree before the generation validation below runs. Any disagreement is
`Corrupt`.

Strict decoding of the current JSON itself needs no predecessor to establish
canonical bytes, intrinsic topology, or its nested checkpoint. The full
profile attestation nevertheless strict-decodes the one retained immediate
predecessor to prove the storage-record/frame/fence cross-links. It never needs
an older manifest. Version `0.0.35` keeps both the current canonical selection
and, for a rotation, that immediate-predecessor canonical selection with their
complete receipt bindings in the normalized Rust result. The existing prior-
aware decode remains useful for validating a proposed immediate edge.

The next rotation validates its immutable plan against the normalized selected
root, not a full manifest chain. Separately, the publication transaction
validates the revocable token's mutable epoch/fence. Plan validation must
preserve profile, database incarnation, scope, scope incarnation, and session;
expect the selected head; seal the selected active generation under its exact
Frame V1 policy; reject a transaction equal to the selected transaction;
reject a proposed committed head equal to either the selected or known
previous head; reject a successor equal to the checkpoint or active
generation; and reject an activation fence equal to the selected activation
fence. The host/profile must still prove lifetime freshness beyond these known
O(1) identities. This closes the v0.0.32 bootstrap and garbage-collection
deadlock without weakening its immediate known-identity reuse protections.

Version `0.0.34` implements that immutable value validation. Independently
trusted receipt, checkpoint-generation, and active-generation bindings supply
the database/scope incarnations and record facts; candidate JSON cannot supply
its own authority. `LocalLogStorageSelectedJsonCodec::normalize_root` accepts
one exact root value, while `normalize_rotation` accepts one exact current
rotation and its exact immediate predecessor. Both return a private-constructor
non-`Clone` `LocalLogStorageSelectedRoot` that privately owns the decoded
checkpoint anchor, exposes inspection facts only, and excludes the mutable
writer epoch/current writer fence. `prepare_rotation_from_selected`,
`encode_rotation_from_selected`, and `decode_rotation_from_selected` validate
the next plan against that summary. Anchor quarantine is ownership/API hygiene,
not secrecy or exclusive authority: public checkpoint bytes and binding
identities can reconstruct a separate structurally checked anchor. Database
and scope incarnations remain selected-root carrier facts rather than
generation-wire fields.

Version `0.0.35` closes the byte-identity gap left by scalar normalization. The
selected root retains the complete checked selected binding and byte-exact
canonical current/optional-predecessor selections. Public code can borrow the
current and optional predecessor receipt bindings, inspect exact byte lengths,
and call `validate_exact_selection_envelope` with its own current/optional-
predecessor strings. Direct access to the retained raw selection JSON remains
core-private. The comparison neither parses nor canonicalizes its inputs and
proves only equality with the already normalized values, never host attestation,
storage currentness, or authority. `Debug` and typed mismatch errors expose no
raw selection/checkpoint JSON, document content, session-state payload, or byte
preview. `Debug` may still show bounded identity values such as the session ID.
The retained selection receipt bindings are caller-supplied validation facts,
not commit evidence.

Version `0.0.36` closes these values into two exact plan shapes.
`LocalLogStorageRootJsonCodec::prepare_root_attempt` takes the planned database
and scope incarnations plus a checked root selection. Its full prospective
candidate selected binding therefore distinguishes equal root JSON planned for
different incarnations. `LocalLogStorageGenerationJsonCodec::prepare_rotation_attempt`
takes a checked candidate manifest and normalized selected root, deriving both
incarnations only from the latter. Both actions strict-encode the exact
candidate, construct its full prospective selected binding, and run final
strict selected normalization. That final proof reconstructs and then drops the
temporary candidate selected root and checkpoint anchor.

The private root plan retains its candidate binding and exact JSON. The
rotation plan additionally copies the complete selected binding and `Arc`-
shares the exact selected current/optional-predecessor JSON. It deliberately
does not retain the input `LocalLogStorageSelectedRoot`, its current anchor,
the temporary candidate anchor, a browser handle, or a revocable writer token.
The selected root's direct raw-JSON access remains core-private; the narrow
public payload-bearing surface is a borrowed request after the state is already
uncertain.

Successful preparation returns private-constructor non-`Clone`
`LocalLogStoragePreparedAttempt`, whose inspection surface provides candidate
receipt/binding facts and exact payload lengths rather than raw JSON. Consuming
`begin_attempt` core-issues a fresh opaque ABA-safe process-local
`LocalLogStorageAttemptId` and moves the exact plan to non-`Clone`
`LocalLogStorageUncertainAttempt` before request egress. That uncertain value
can yield one borrowed request for the physical attempt. A root request exposes
the candidate binding and exact candidate JSON; a rotation request also exposes
the selected binding and exact selected current/optional-predecessor JSON that
the future adapter must compare. All request/state/error diagnostics redact
payload bytes.

Consuming `begin_exact_resubmission` preserves the same retained plan
allocations and every byte, issues a fresh attempt ID, restores one-request
eligibility, and remains uncertain because the prior physical attempt can still
commit. `require_current_attempt_id` rejects a cross-plan or earlier-retry ID,
but matching and mismatch are correlation only, never terminal evidence.
Attempt IDs/state are volatile, nonserializable, and unrecoverable after process
restart. The one-shot borrowed request cannot prevent the host from copying its
strings or dispatching duplicate external operations.

Version `0.0.37` adds a non-`Clone`
`LocalLogStorageAttemptTerminalAttestation` with stable
`PublicationCompleted`, `TransactionAborted`, and `NotAttempted` kinds. The
host may construct `PublicationCompleted` only for the exact transaction object
associated with the emitted request ID, after it took the publication branch,
passed all independent checks, enqueued the complete exact mutation set, and
emitted `complete`. Completion of a resolver, cleanup, validation-only,
idempotent no-write, or differently correlated transaction is not this
attestation.

The one borrowed adapter request exposes a clonable opaque
`LocalLogStorageAttemptRequestId` created at egress. The
publication-completed and transaction-aborted constructors require that exact
request ID, so the safe API cannot manufacture either attestation before
egress. The token binds one emitted request and at most one associated
transaction to its attempt; it is not a capability, transaction handle,
receipt, or durable identifier. `NotAttempted` instead names the attempt ID and
is legal with or without prior request egress when the named invocation created
no publication-capable transaction. Consuming `observe_terminal_attestation`
checks the exact retained request/attempt correlation. Success yields
`LocalLogStorageHostAttestedCommitted`, `LocalLogStorageAttemptAborted`, or
`LocalLogStorageNotAttempted`. Rejection is recoverable: the typed failure owns
the unchanged state, unapplied attestation, and payload-free transition error.

Abort and not-attempted close only one physical invocation. Both retain the
exact plan and may exactly resubmit it under a fresh ID. One attempt ID names
one adapter invocation and at most one associated publication transaction.
Copied request bytes may produce another transaction, but that dispatch is
outside the original ID correlation and requires future storage resolution;
each negative state has consumed the invocation's one terminal observation.
`HostAttestedCommitted` cannot resubmit and is historical only: it does not
prove current selection, durable flush, writer authority, or owner release.

Here O(1) means constant in the number of older rotations, not constant bytes.
Root normalization reads and retains bounded root/checkpoint bytes. Rotation
normalization reads and retains bounded current and immediate-predecessor
selection bytes and strictly decodes both nested checkpoints; the current
checkpoint is decoded again to retain its anchor. The result therefore owns up
to two complete canonical outer selections, each of which may embed a full
checkpoint, in addition to the current checkpoint text and decoded anchor. CPU
and retained memory may scale with those byte limits and with both checkpoints'
documents, session histories, and replay tombstones. No complete manifest-chain
walk is required, but the operation is not constant in document or input size.
The v0.0.36 attempt plan is also O(1) only in history count: a root retains one
complete candidate envelope, while a rotation can retain three complete outer
payload envelopes (candidate, selected current, and optional selected
predecessor). Final candidate normalization also temporarily decodes and
reconstructs the candidate anchor before dropping it.

## Database schema

The schema upgrade transaction creates exactly five object stores with
out-of-line keys:

1. `meta`
2. `scopes`
3. `transactions`
4. `generations`
5. `chunks`

`transactions` has one unique index named `byCommittedHead` with compound key
path `["scopeId", "scopeIncarnationId", "committedHeadId"]`. There are no
other indexes. Retired transaction records retain these indexed fields, so
`add()` cannot silently recycle any committed head in the incarnation.

`upgradeneeded` creates schema only. It does not provision an editor scope.
Schema changes are exclusive and roll back if the upgrade transaction aborts;
an open succeeds only after its upgrade completes. Every connection listens
for `versionchange`, stops accepting work, and closes promptly. An abnormal
`close` invalidates the adapter; it must reopen and revalidate the profile
record before further work.

Before reading or establishing `meta/profile`, each newly opened connection
attests the physical schema. It requires the exact database name/version and
exact five object-store name set; every store must report `keyPath === null`
and `autoIncrement === false`; `meta`, `scopes`, `generations`, and `chunks`
must have empty index sets; and `transactions` must have only
`byCommittedHead`, whose key path is exactly
`["scopeId", "scopeIncarnationId", "committedHeadId"]`, with `unique === true`
and `multiEntry === false`. Any mismatch makes the profile unavailable. The
adapter never stamps, upgrades, or repairs a pre-existing incompatible
version-1 database. Schema attestation alone never authorizes stamping a
schema-compatible database that already contains unclaimed records; the
database-incarnation establishment rules below also attest store contents.

### Keys

All keys are constructed from already validated strings:

- `meta`: the literal key `profile`;
- `scopes`: `scopeId`;
- `transactions`: `[scopeId, scopeIncarnationId, transactionId]`;
- `generations`: `[scopeId, scopeIncarnationId, logId]`; and
- `chunks`: `[scopeId, scopeIncarnationId, logId, chunkOrdinal]`.

Database and scope incarnations are distinct Rust types in `0.0.34`:
`LocalLogStorageDatabaseIncarnationId` and
`LocalLogStorageScopeIncarnationId`. Each is owned ASCII using exactly
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Syntax proves neither freshness nor
entropy. A database incarnation is lifetime-fresh for each physical profile
database establishment; a scope incarnation is lifetime-fresh within one
database incarnation and is never shared by two scope lifetimes. They are
non-secret and never interchangeable at a Rust or Wasm boundary.

`chunkOrdinal` is exactly twenty ASCII decimal digits, zero padded on the left.
This avoids JavaScript integer precision and gives deterministic key ordering
through `18446744073709551615`. Through version `0.0.36`, no append or
chunk-size protocol is defined; therefore the only valid newly reserved
generation has no chunk records. A future append checkpoint must freeze chunk
boundaries before writing nonempty values.

Complete-prefix inspection uses an inclusive lower key
`[scopeId, scopeIncarnationId, logId]` and exclusive upper key
`[scopeId, scopeIncarnationId, logId + "\u0000"]`. The validated log-ID grammar
forbids NUL, so IndexedDB's lexicographic array/string ordering places every
longer key with the exact three-part prefix inside this range, regardless of a
malformed fourth component or extra components. A cursor requires every
observed key to be an exact four-part array whose last member is a twenty-digit
string no greater than `18446744073709551615`; anything else is corruption.
Reservation requires no record in the range. Cleanup first validates the
complete cursor and only then deletes that exact prefix range in the same
transaction, so malformed keys are never silently erased.

Absent-scope provisioning performs a broader collision scan in each of
`transactions`, `generations`, and `chunks`: inclusive lower key `[scopeId]`
and exclusive upper key `[scopeId + "\u0000"]`. The validated scope grammar
also forbids NUL, so this range contains every array key whose first member is
the exact scope ID, including malformed extra or missing members. Any observed
record is an orphan collision and provisioning fails closed.

### Meta record

The `meta/profile` value is a closed structured-clone object:

```text
recordVersion: 1
profileId: "breditor/indexeddb-local-log"
profileVersion: 1
databaseVersion: 1
databaseIncarnationId: validated fresh opaque ID
```

After schema open, one strict `readwrite` transaction establishes this record
with `add()` if absent or validates it exactly if present. If the record is
present, it must be the only record in `meta`. If it is absent, every one of
the five stores, including `meta`, must be empty before the adapter may add it.
A schema-compatible but prepopulated database with no profile record is
corrupt or foreign, not an uninitialized profile database. The incarnation is
never changed by this profile. A missing or different incarnation while
resolving an older plan means storage was uninitialized, cleared, recreated,
or replaced; it never proves that the older plan did not commit historically.

### Scope head record

The `scopes/scopeId` value is the only mutable authority selector:

```text
recordVersion: 1
profileVersion: 1
databaseIncarnationId
scopeId
scopeIncarnationId
sessionId
headId
transactionId
previousTransactionId: null | exact immediately preceding transaction
selectionKind: "root" | "rotation"
writerEpoch: canonical unsigned decimal string
currentWriterFenceId
```

The record does not duplicate checkpoint payload. It selects exactly one exact
transaction record in the same database and scope incarnation and may name the
only other exact record retained for one-step superseded resolution. The
selected transaction key, value, scope control, and strictly decoded selection
must cross-link completely: database and scope incarnations, `scopeId`,
`transactionId`, `expectedHeadId`, `committedHeadId`, selection kind/format,
and session must all agree. A root requires null `expectedHeadId` and null
`previousTransactionId`. A rotation requires its decoded `expectedHeadId` to
equal the committed head of the exact transaction named by
`previousTransactionId`; that previous transaction's key/value identities and
strict canonical selection must also agree. The generation, frame, and fence
cross-links described below are part of the same validation. Missing, retired,
or mismatched selected data is corruption, not permission to fall back to
another generation.

`writerEpoch` begins at one and increases by exactly one on every writer-fence
acquisition and every root-changing rotation. It never wraps; reaching
`u64::MAX` makes the scope read-only until a future migration. A writer token
is valid only for the exact database/scope incarnation, selected head, active
generation, epoch, and current writer-fence ID that a mutation transaction
rechecks. The immutable selection `fenceId` is not rewritten when this mutable
epoch changes.

Scope incarnations are lifetime-fresh and never reused. Profile V1 exposes no
scope-deletion or reprovision-in-place operation. Clearing storage is outside
the profile and is detected through missing/different database and scope
incarnations.

### Transaction identity records

Transaction keys are append-only. `add()` creates a closed exact record. The
current and immediate predecessor stay exact. A later successful rotation may
change the older predecessor exactly once to the closed retired shape. An
exact record contains:

```text
recordVersion: 1
state: "exact"
databaseIncarnationId
scopeId
scopeIncarnationId
transactionId
expectedHeadId: null for root, exact prior head for rotation
committedHeadId
selectionKind: "root" | "rotation"
selectionJson: owned ArrayBuffer containing exact canonical UTF-8 bytes
```

The state/payload representation is mutable exactly once, but the database,
scope, incarnation, transaction, expected-head, committed-head, and selection-
kind identity fields are immutable. Retirement must preserve them byte-for-
byte.

Only the transactions selected by `transactionId` and
`previousTransactionId` may be exact. During a successful rotation, the old
`previousTransactionId`, if any, is changed in the same transaction to:

```text
recordVersion: 1
state: "retired"
databaseIncarnationId
scopeId
scopeIncarnationId
transactionId
expectedHeadId
committedHeadId
selectionKind
selectionByteLength: canonical unsigned decimal string
```

The retired record is an identity tombstone, not an exact plan receipt. It
proves that a transaction key and committed-head identity were historically
allocated within the same incarnation and prevents their reuse. It cannot
prove byte equality for a late caller-supplied candidate. Such a query returns
`ResolutionRetired` and releases no writable owner. The adapter must never
report that the supplied bytes committed or call it exact idempotent success.

Transaction tombstones are never deleted in profile V1. This is unbounded
`O(total committed rotations)` metadata. Retaining only two exact selections
prevents `O(rotations * document size)` checkpoint retention while resolving
one superseded plan byte-exactly and remaining fail-closed for older retries. A
future bounded tombstone-compaction profile requires a separate protocol;
silently deleting these records is not allowed.

### Generation records

A root first adds a permanent checkpoint-only identity record:

```text
recordVersion: 1
state: "checkpoint-only"
databaseIncarnationId
scopeId
scopeIncarnationId
logId
sessionId
establishedByHeadId
```

It has no frame, fence, or chunks and never becomes writable. This prevents the
nested checkpoint generation ID from later being reused. The root also adds a
newly reserved active generation:

```text
recordVersion: 1
state: "active"
databaseIncarnationId
scopeId
scopeIncarnationId
logId
sessionId
frameFormatVersion: 1
maxPayloadBytes: canonical unsigned decimal string
activatedFenceId
activatedByHeadId
```

An ordinary rotation changes the formerly active generation to `retired` in
the same atomic transaction that selects its checkpoint and reserves its
successor. The retired value retains every field above and adds
`retiredByHeadId`. Cleanup changes only `state` from `retired` to `reclaimed`
after deleting every matching chunk. Generation records are never deleted, so
a reclaimed log ID remains permanently unavailable for reuse.

The scope head's selected value and generation metadata must identify the same
session, active log, frame policy, immutable activation fence, and activating
head. Mutable writer epoch/fence facts come only from the scope control and do
not alter this historical association. Any mismatch is corruption. A
generation is empty exactly when its metadata is newly added as `active` and
the transaction has proved that its complete chunk-key prefix is absent.
Object existence or an empty-looking first chunk is not enough.

Current-selection validation always reads both named generations. For a root,
the checkpoint record must be `checkpoint-only` with the exact session/log and
`establishedByHeadId == committedHeadId`. For a rotation, the checkpoint record
must be `retired` or `reclaimed`, match the selected sealed log/frame/session,
have `activatedByHeadId == expectedHeadId`, take its `activatedFenceId` from the
validated immediate-predecessor exact selection, and have
`retiredByHeadId == committedHeadId`. In both cases the active record must match
the selected active log/frame/session/activation fence and have
`activatedByHeadId == committedHeadId`. Missing or mismatched checkpoint
metadata is corruption even when the nested checkpoint JSON itself decodes.

### Chunk records

Chunk values are owned `ArrayBuffer` byte sequences. Profile V1 reserves their
namespace and deletion semantics but does not authorize nonempty writes.
The future append contract must bind every append to the exact current scope
head, active generation, writer epoch, current writer-fence ID, and unpersisted
revocable writer token in the same five-store transaction scope. An activation
`fenceId` or writer-fence string alone must never pass that boundary.

## Fixed transaction scope

Every profile publication, restart-resolution/fence acquisition, append once
defined, and payload cleanup transaction is created as:

```js
db.transaction(
  ["meta", "scopes", "transactions", "generations", "chunks"],
  "readwrite",
  { durability: "strict" },
)
```

The adapter requires `transaction.durability === "strict"`; otherwise this
profile is unavailable. Calling `commit()` may finish an active transaction
earlier but does not strengthen its atomicity or durability and is not receipt
evidence.

IndexedDB serializes overlapping read/write transactions by object-store
scope, and a later overlapping transaction sees the earlier transaction after
it finishes. It has no record-level compare-and-swap primitive. The profile
therefore reads, compares, and writes the head inside one transaction. Because
all scopes share all five stores, independent editor writes serialize. This is
an accepted V1 limitation, not an accidental performance promise.

Request handlers must not call `preventDefault()` to preserve a transaction
after a profile request error. Any request error aborts the complete operation.
If adapter code throws after writes were queued, it explicitly requests abort
and waits for the transaction's terminal event; without that observation the
result remains uncertain.

## Database-incarnation establishment

After a successful schema open:

1. Attest the exact physical schema described above.
2. Generate one fresh candidate database incarnation outside a transaction.
3. Open the fixed strict transaction. In its creation task, enqueue a read of
   `meta/profile` and a `count()` request for every one of the five stores.
4. If the profile record is present, require the `meta` count to be exactly one,
   validate every field, and use its stored incarnation. Existing records in
   the other four stores are then governed by that established incarnation.
5. If the profile record is absent, require all five counts to be zero before
   synchronously `add()`ing the candidate meta record. Any nonzero count is a
   corrupt or foreign database; never adopt, clear, or relabel those records.
6. Treat only transaction `complete` as establishment. On an observed abort,
   resolve or retry from a fresh transaction. On lost observation, reopen and
   read in another fixed transaction.

Competing tabs converge because their overlapping transactions serialize; only
the first empty-state transaction can add, and the next observes the exact
record. An incompatible record or any record in an unstamped database makes
the profile unavailable. The adapter never deletes or repairs it implicitly.

This establishment path is available only before an operation is bound to an
expected database incarnation. Provisioning, rotation, restart, cleanup, or
outcome resolution carrying an expected incarnation treats a missing or
different meta record as `StorageResetOrIndeterminate`; it must never create a
replacement record and then classify the older plan against it.

## Initial scope provisioning

All root bytes and scalar inputs are prepared and validated before the
transaction opens. The v0.0.36 borrowed root request supplies the complete
candidate binding and exact candidate JSON, but performs no provisioning and
contains no database handle or authority. A future adapter must combine that
request with separately acquired profile authority. Provisioning then:

1. Reads and validates the exact meta record and database incarnation.
2. Reads `scopes/scopeId`, the planned transaction key, and the planned
   committed-head unique-index key.
3. If the scope exists, applies the retry matrix below and does not overwrite.
4. If the scope is absent, requires the planned committed-head index key and
   all three complete scope-ID ranges defined above to be empty. This proves
   the planned transaction, both generation keys, and both chunk prefixes are
   absent while also rejecting every other valid or malformed array-keyed
   orphan under that scope.
5. `add()`s the exact root transaction record with exact root JSON bytes.
6. `add()`s the permanent checkpoint-only generation identity.
7. `add()`s the active generation record using a fresh scope incarnation and
   the root's immutable activation fence.
8. `add()`s the first scope control/head selecting that transaction and root
   head, with writer epoch one and the root fence as its initial current writer
   fence.

The four additions commit or roll back together. Schema can therefore exist
without a scope after a crash, but a committed scope cannot expose a head
without its exact root or expose a root without its empty active reservation.

Provisioning outcomes are:

- exact selected head, exact root bytes, checkpoint tombstone, and matching
  active generation metadata observed inside the transaction (its tail may no
  longer be empty after a future valid append):
  `CommittedSelectedAtResolution`;
- exact root transaction named as the immediate predecessor of a valid later
  selection: `CommittedSuperseded`;
- retired root transaction identity: `ResolutionRetired`; its supplied bytes
  are no longer profile-attested;
- absent scope and absent planned artifacts in the same known database
  incarnation: `RetryEligibleAtResolution` (advisory after the transaction);
- same ID with any different fact/byte: `CollisionOrCorruption`;
- another valid scope incarnation/head: `ScopeAlreadyProvisioned`; and
- missing or changed database incarnation: `StorageResetOrIndeterminate`.

Orphan artifacts with no scope head are corruption. Profile V1 never adopts or
silently deletes them. Every provisioning retry after the first attempt routes
through the general resolver; `ScopeAlreadyProvisioned` is used only when no
matching exact or retired root transaction identity exists.

## Ordinary rotation publication

All candidate bytes, the exact prior selected bytes, and comparisons are
prepared before opening the transaction. The v0.0.36 borrowed rotation request
carries the full candidate and selected bindings plus their exact retained JSON,
including the candidate's fresh activation fence. The immutable Rust
plan/request deliberately carries no revocable writer token; a future adapter
invocation must supply that profile authority separately. Within the active
transaction the adapter:

1. validates schema, meta, and the exact database/scope incarnations;
2. pumps reads for the scope control, selected exact transaction, named
   previous exact transaction when non-null, selected checkpoint and active
   generations, candidate transaction key, candidate committed-head index key,
   candidate generation key, and successor chunk prefix;
3. requires the current control, selected transaction bytes, checkpoint
   generation, and active generation to equal the immutable selected-binding
   and exact-selection facts snapshotted in the rotation request and requires
   the candidate expected head to be selected;
4. requires the token's selected head, active log, writer epoch, and current
   writer fence to match exactly;
5. when `previousTransactionId` is non-null, requires that record to be
   `exact`, match its key and immutable identity fields, contain valid exact
   selection JSON, and have `committedHeadId` equal to the current selected
   rotation's `expectedHeadId`; root selections instead require null;
6. requires the candidate transaction, committed-head unique-index, and
   generation keys to be absent;
7. requires the complete successor chunk prefix to be absent;
8. changes the validated old previous exact transaction, if present, to its
   retired tombstone while leaving the currently selected exact record intact;
9. changes the prior active generation record to `retired` by the candidate
   committed head;
10. `add()`s the candidate exact transaction record with exact canonical
    ordinary-rotation JSON;
11. `add()`s the exact empty active successor generation under the manifest's
    immutable activation fence; and
12. `put()`s the scope record selecting the candidate head/transaction, naming
    the formerly selected transaction as `previousTransactionId`, and advancing
    the writer epoch by exactly one with `currentWriterFenceId` equal to the
    candidate manifest's fence. Epoch exhaustion rejects the complete attempt.

The prior exact selection remains current until this entire transaction
commits. The successor cannot be partially selected, and retired payload chunks
remain unreachable but reclaimable. A request-level success in steps 8–12 does
not change the public outcome.

Pre-attempt/retry classifications inside this transaction are:

- candidate exact record plus exact selected head/bytes/generation observed in
  the transaction: `CommittedSelectedAtResolution`;
- candidate exact record named as the immediate predecessor of a valid later
  selected head: `CommittedSuperseded` and no writable release;
- candidate retired record with matching identities: `ResolutionRetired`; it
  does not attest the supplied bytes and permits no writable release;
- candidate record under the same key with different identities:
  `CollisionOrCorruption`;
- candidate absent and exact expected current selection:
  `RetryEligibleAtResolution` (advisory after the transaction);
- candidate absent and another valid current head:
  `DefinitelyNotCommittedConflict`; and
- any broken selected-record/generation association:
  `Corrupt`.

## Terminal evidence and uncertain resolution

IndexedDB atomically commits all transaction changes or aborts and rolls them
back. Its `complete` event is fired only after successful commit; a particular
request can report success and the transaction can still fail later. Version
`0.0.37` implements only typed process-local host attestation, not an IndexedDB
adapter or serialized resolver. A future adapter maps observations as follows:

- the exact publication-armed transaction associated with the emitted request
  ID passes every check, enqueues the complete exact mutation set, and emits
  `complete`: construct `PublicationCompleted` from that request ID, which
  becomes `HostAttestedCommitted`;
- that associated physical transaction emits `abort`: construct
  `TransactionAborted` from that request ID, which becomes `AttemptAborted`;
  this transaction rolled back, but plan-level status remains unresolved;
- the named adapter invocation closes before creating a publication-capable
  transaction: construct `NotAttempted`; and
- request success, `commit()` return, an unrelated or nonpublication
  transaction's `complete`, connection close, page navigation, worker/process
  loss, callback loss, timeout, or cancellation without matching terminal
  evidence: retain `Uncertain`.

The attestation constructors are trusted host assertions. Rust checks the exact
process-local attempt/request correlation but cannot inspect the
`IDBTransaction` or authenticate event provenance. The safe API exposes the
request ID only at egress, so publication-complete and abort cannot be attested
before then; not-attempted is also legal before request egress. A rejected
attestation returns the complete unchanged owner and unapplied observation.

`HostAttestedCommitted` is historical: the transaction selected the plan at its
commit point, but a later serialized transaction may have superseded it before
the callback runs. It proves neither durable flush nor current writer authority
and releases no writable owner. `AttemptAborted` and `NotAttempted` are even
narrower physical-invocation observations. They retain the exact plan for
allocation-preserving exact resubmission under a fresh ID. The core cannot
prevent callers from copying those bytes or dispatching duplicates, but such a
dispatch is outside the original attempt correlation and must be classified by
storage resolution rather than another terminal attestation.

The serialized resolver is deferred to v0.0.38. It must reopen as needed and
create one later fixed-scope `readwrite` transaction. Overlapping store scope
orders it after transactions created earlier, but it cannot rule out a copied
publication transaction created after the resolver. The typed resolver request
and evidence therefore need separate root and rotation shapes:

- A root resolver reads/validates meta, the planned scope, planned transaction
  key, planned committed-head index key, both planned generation keys and scope
  artifact ranges. When the candidate exists, it additionally validates the
  exact root selection, checkpoint-only generation, active generation, and
  scope-control association when selected; a later valid current plus exact
  root immediate predecessor when superseded; or immutable identity only when
  retired. An absent scope is eligible only when every planned artifact is
  absent in the expected database incarnation; a different valid scope is
  `ScopeAlreadyProvisioned`.
- A rotation resolver reads/validates meta, scope control, the planned
  transaction and committed-head index keys, and the selected generation
  records. Its exact envelope comparison is case-specific: candidate absence
  requires current storage to equal the full snapshotted prior selected binding,
  current JSON, and optional predecessor JSON; candidate selected requires the
  candidate binding/JSON as current and the plan's prior selected-current JSON
  as immediate predecessor; candidate superseded requires a valid later current
  with the exact candidate as immediate predecessor. A retired candidate proves
  only immutable identity. Every branch preserves the expected database/scope
  incarnations and fails closed on conflicting relationships.

For either shape, exact selected evidence is
`CommittedSelectedAtResolution`; an exact immediate predecessor is
`CommittedSuperseded`; a matching retired identity is `ResolutionRetired` and
does not attest the old supplied bytes; reused identities or broken
associations fail closed as collision/corruption; and a missing/different
incarnation is `StorageResetOrIndeterminate`. A valid different current head in
the same rotation scope is `DefinitelyNotCommittedConflict` because the
immutable expected head cannot become selected again.

Candidate and committed-head absence after the complete shape-specific checks
is only `RetryEligibleAtResolution`, never definite plan-level noncommit. It is
advisory once the resolver transaction finishes because another copied dispatch
may publish later. If resolution and retry are combined, comparison and all
retry writes remain in that same transaction. Otherwise the later publication
attempt must repeat every comparison and authority check; a prior inspection is
not a compare-and-swap. When the resolver starts from
`HostAttestedCommitted`, same-incarnation candidate absence instead contradicts
the append-only transaction record and is corruption; a missing/different
incarnation remains reset/indeterminate.

## Restart and revocable mutation authority

Normal restart also uses the fixed transaction scope. It validates meta, reads
the scope control, selected exact transaction, previous exact transaction when
non-null, and both checkpoint/active generation records. It validates their
complete immediate linkage through the full profile-attestation envelope:
current receipt facts and JSON, optional immediate-predecessor receipt facts
and JSON, both generation records, both incarnations, the scope control, and
the writer envelope. Rust strict-decodes both JSON values under their separate
trusted receipt bindings when a predecessor exists, validates all cross-links,
then returns the normalized non-`Clone` selected identity envelope described
above. It retains the complete checked selected binding and exact current plus
optional immediate-predecessor canonical JSON, but not a longer predecessor
chain. The adapter validates the mutable writer envelope but does not retain it
inside that result. Public inspection exposes borrowed current/predecessor
receipt bindings and byte lengths. Direct raw-JSON getters remain core-private;
v0.0.35 exposes exact caller-supplied comparison, and a v0.0.36 rotation attempt
snapshots the binding and `Arc`-shared strings for its later borrowed adapter
request without retaining this selected root or anchor. The selected result
privately owns the checkpoint anchor, returns no public anchor, and constructs
no writable tail owner.

To acquire a revocable storage-mutation token, the host opens the fixed
transaction, rechecks the exact selected head/transaction/active generation,
advances the nonwrapping writer epoch, and stores a fresh
`currentWriterFenceId`. The
transaction's `complete` proves that acquisition committed historically, but
another acquisition or rotation may revoke it before its callback runs. Every
append and rotation therefore rechecks the token's exact head, active log,
writer epoch, and current writer fence inside that mutation's own transaction.
Acquisition returns a separate token; it neither mutates nor invalidates the
immutable selected-root summary merely because its epoch advanced. A mutation
uses both values and rejects if either the immutable selection or mutable token
no longer matches storage.

Pure IndexedDB V1 provides fencing at each mutation, not a long-lived exclusive
lock between transactions. No finite postcommit recheck removes that race. A
future profile may additionally hold a separately specified Web Lock, but this
profile neither requires nor inherits one. `fenceId`, a JavaScript object
reference, a receipt copied from another run, and a successfully decoded
manifest are insufficient separately.

Consequently this profile can never release a long-lived exclusive writable
`breditor-core` cursor or session. An already returned Rust owner cannot be
synchronously revoked when another browser transaction advances the epoch.
A later implementation must either hold a separately specified lock for the
entire owner lifetime, couple every semantic admission to one successful
storage mutation, or expose an explicitly revocable/speculative branch that is
quarantined on conflict. Profile V1 chooses none of those policies.

Profile `0.0.33` freezes these obligations. Through version `0.0.36`, none of
the revocable-token allocator, fence-acquisition transaction, append operation,
exclusive lock, speculative branch, or consuming Rust typestate is implemented.
Those remain later design gates.

## Retired-generation cleanup

Payload cleanup is independent of head selection because the rotation
transaction atomically made the checkpoint authoritative and marked the former
active generation retired. Cleanup:

1. opens the fixed strict transaction;
2. validates meta, the current scope/incarnation, and the exact generation
   tombstone;
3. proceeds only from `state: "retired"`;
4. deletes every chunk under that exact scope/incarnation/log prefix; and
5. changes the generation state to `reclaimed`, retaining all identity,
   session, frame, fence, activation, and retirement facts.

`complete` attests that this cleanup committed. An observed abort proves only
that this cleanup attempt rolled its deletions back; another serialized cleanup
may already have completed. A lost event is resolved or retried idempotently;
`reclaimed` plus an empty prefix is already complete. `active`, missing,
mismatched, or unexpectedly nonempty `reclaimed` state is a hard stop. Cleanup
never deletes transaction or generation tombstones and never makes an identity
reusable.

This avoids retaining a manifest chain and avoids requiring the head to remain
at the rotation that retired the generation. A later rotation may safely occur
before payload cleanup; both serialize with cleanup through the fixed object-
store scope.

## Durability, eviction, and security limits

`strict` asks the user agent to verify writes reached a persistent medium
before considering the transaction committed, but the standard explicitly
defines this as a durability hint. The profile promises only that the adapter
observed IndexedDB's strict transaction completion semantics. It does not
promise native `fsync`, directory synchronization, survival of all operating-
system or hardware failures, or permanent availability.

Storage buckets begin in `best-effort` mode. `navigator.storage.persist()` is a
separate permission that can protect against user-agent clearing policies; it
does not strengthen a particular IndexedDB commit. Persistent storage can
still be cleared with origin or user involvement. The adapter may report
bucket persistence as diagnostics, but it is not folded into transaction
authority.

Profile V1 also provides no cryptographic integrity, authentication,
authorization against same-origin script, rollback protection against restored
browser profiles, cross-device durability, backup, multi-writer consensus, or
proof that a browser faithfully implemented the standard. TLS and the web
origin/storage-key boundary matter for isolation, but are not Breditor writer
capabilities.

## Explicit V1 limitations

- No IndexedDB, JavaScript, Wasm, filesystem, or other storage adapter exists
  in `0.0.37`; the implemented Rust values and attempt states perform no I/O.
- Root preparation/encoding/decoding, selected receipt/generation bindings,
  root/rotation normalization, and selected-root-aware next-rotation validation
  prove only bounded value and cross-link consistency. They do not provision a
  database, scope, head, checkpoint generation, or empty active generation.
- No pure-Rust value proves CAS or current-head status, global ID/fence
  freshness, physical generation emptiness, mutable writer authority/epoch,
  authenticated browser-event provenance, durability, or ownership release.
  The v0.0.37 terminal states validate process-local correlation around trusted
  host assertions only; the attempt plan/request contains no adapter or
  authority.
- O(1) selected normalization and retention are constant only in rotation-
  history length. The selected root retains up to two complete canonical outer
  selections plus current checkpoint text and a decoded anchor, so memory can
  scale with bounded current/immediate-predecessor checkpoint, document,
  session, history, and tombstone payloads. A rotation attempt plan retains up
  to three complete outer payload envelopes: candidate, selected current, and
  optional selected predecessor. Final plan preparation also temporarily
  reconstructs and then drops the candidate anchor.
- `LocalLogStorageAttemptId`, `LocalLogStorageAttemptRequestId`, attestations,
  and all attempt/evidence states are process-local and have no wire,
  persistence, cross-process, or restart representation. They support only a
  surviving exact in-memory plan; crash-time plan reconstruction and resolver
  correlation are not implemented.
- One physical attempt yields at most one borrowed request view, but public
  request strings can be copied and the external operation can be dispatched
  more than once. One attempt ID nevertheless names one adapter invocation and
  at most one associated publication transaction; duplicate dispatches are
  outside that correlation. This API guard is not single-dispatch evidence.
- All writes serialize across all scopes because IndexedDB scheduling is
  object-store-granular and the profile deliberately fixes one common scope.
- Transaction and generation identity tombstones grow without bound.
- In IndexedDB storage, only the current and immediate predecessor transaction
  records retain exact selection bytes; older retries resolve as
  `ResolutionRetired` and cannot release a writer. One normalized Rust selected
  root mirrors that bounded exact-selection window and retains no older chain.
- Exact selected-envelope equality proves neither host attestation nor that the
  same bytes remain selected in storage. Selection receipt bindings are caller-
  supplied validation facts, not commit evidence.
- IndexedDB alone provides no stable exclusive writer between transactions;
  every mutation pays for a serialized head/generation/writer-epoch recheck.
- Profile V1 cannot release a long-lived exclusive Rust writer; a held-lock,
  transaction-coupled admission, or speculative-branch contract is still
  required.
- Nonempty chunk layout, append, flush/acknowledgement, aggregate tail replay,
  chunk-size limits, and tail truncation are not defined yet.
- `strict` durability is a hint and browser storage can be cleared, recreated,
  corrupted, quota-limited, or made unavailable.
- Database schema migration and scope deletion/reprovisioning are forbidden,
  not silently approximated.
- The profile does not solve a compromised same-origin writer, browser rollback,
  collaboration, cryptographic authenticity, or distributed consensus.

## Next implementation gate

Version `0.0.34` implements the intended pure Rust value boundary: distinct
bounded database/scope incarnation IDs; private root prepare/encode/decode;
trusted selected bindings; root/rotation normalization; and
`prepare_rotation_from_selected`, `encode_rotation_from_selected`, and
`decode_rotation_from_selected`. It deliberately exposes no `IDBDatabase`,
promise-based I/O, commit receipt, or writable-owner release.

Version `0.0.35` adds exact selected identity-envelope retention and public
byte comparison. The selected root holds its complete checked binding and exact
current/optional-predecessor selections, exposes borrowed receipts and lengths,
keeps direct raw-selection access core-private, and keeps `Debug`/errors payload-
redacted. It adds no host attestation, currentness, or commit evidence.

Version `0.0.36` implements private non-`Clone` exact root/rotation plans and
private-constructor, anchor-free, non-authority `Prepared`/`Uncertain` states.
Plans retain a full prospective candidate binding and exact candidate JSON;
rotation also snapshots the full prior selected binding and shares exact selected current/
optional-predecessor JSON without retaining a selected root or anchor. Final
strict normalization reconstructs and drops the candidate anchor. The core
issues one fresh ABA-safe process-local ID before one borrowed request can be
exposed; exact resubmission preserves the plan allocations/bytes under a fresh
ID. Cross-plan/stale-ID rejection classifies nothing, and the one-shot request
cannot prevent copied bytes or duplicate external dispatch. This boundary has
no browser I/O, adapter, authority, durability, or owner release. Request
success, `commit()` return, and an abort callback do not become plan-level
finality.

Version `0.0.37` adds exact-ID `LocalLogStorageAttemptTerminalAttestation`,
stable physical terminal kinds, consuming `observe_terminal_attestation`, and
recoverable transition failure. An exact publication-armed completion becomes
host-attested historical commit. Publication-completed and transaction-aborted
require the exact opaque request ID emitted at egress; not-attempted instead
names the attempt ID. Abort and not-attempted remain physical-only states with
exact resubmission under a fresh ID. The boundary verifies neither IndexedDB
event provenance nor current storage and has no crash reconstruction.

Version `0.0.38` is the next gate and should implement distinct root and
rotation serialized-resolver evidence: exact selected/superseded resolution,
advisory `RetryEligibleAtResolution` for shape-correct serialized absence, and
fail-closed retired/reset/corrupt classifications. It must not call absence
definite noncommit because a copied dispatch can create a later transaction.
Only after those boundaries and their adversarial tests are stable should a
JavaScript adapter be implemented and tested in real browsers. Consuming
exclusive-owner typestate remains blocked on a separately frozen held-lock,
transaction-coupled admission, or speculative-branch contract.
