# IndexedDB local-log storage profile

Status: profile contract frozen in Breditor `0.0.33`; pure-Rust root/selection
values implemented in `0.0.34`; exact selected identity-envelope retention and
comparison implemented in `0.0.35`; exact non-owning attempt plans and
`Prepared`/`Uncertain` mechanics implemented in `0.0.36`; process-local exact
physical-attempt terminal attestations implemented in `0.0.37`; directional
resolution-value comparisons and the closed retired-transaction binding
implemented in `0.0.38`; process-local root resolution implemented in `0.0.39`
and rotation resolution implemented in `0.0.40`; canonical writer epoch,
exact non-authority mutation-fence comparison, and checked acquisition planning
implemented in `0.0.41`; process-local request-correlated writer-fence
acquisition and revocable-token issuance implemented in `0.0.42`;
pure token-and-tail-cursor single-frame append preparation implemented in
`0.0.43`; pure nonempty bounded speculative append FIFO implemented in
`0.0.44`; process-local uncertain FIFO-head attempt and one-shot exact request
implemented in `0.0.45`; attempt/request-correlated-as-appropriate append
terminal classification and explicit one-head acknowledgement implemented in
`0.0.46`; same-process append lost-callback resolution implemented in
`0.0.47`; no IndexedDB/JavaScript/Wasm adapter, process-restart append
reconstruction, or executable provisioning exists

Profile identifier: `breditor/indexeddb-local-log`

Profile version: `1`

IndexedDB database name: `breditor-local-log-v1`

IndexedDB database version: `1`

Compatibility status: experimental local-log profile outside the `0.1.x`
browser compatibility promise

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

Version `0.0.33` freezes these decisions; versions `0.0.34` through `0.0.47`
implement only their profile-independent Rust value, attempt, and resolution
subset:

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
   its emitted request ID. A bare `complete` event from another branch or
   transaction is insufficient. `abort` attests rollback of that physical
   transaction only; another copied or serialized dispatch may already be
   committing the same plan when its event handler runs.
6. A missing terminal event is `Uncertain`. A later exact-scope `readonly`
   transaction resolves it from one stable snapshot of the database and scope
   incarnations, immutable transaction identity record, current head, and
   current exact selection. It requests no durability mode and must reach
   terminal `complete` after all reads and scans.
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
12. One `chunks` value is exactly one complete Local Log Frame V1 with no
    trailing bytes. Its fourth key component is the frame's canonical
    generation-relative byte start, not an ordinal. Append and rotation share
    one serialized comparison of the current complete tail end.

## Authority split

`breditor-core` remains synchronous, deterministic, and free of browser
handles. Versions `0.0.34` through `0.0.47` can:

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
  attestations require the exact opaque request ID emitted by the request; and
- directionally compare a later same-selection binding while allowing only
  `Retired -> Reclaimed`, validate an active generation's exact
  retired/reclaimed successor under a distinct retiring head, and represent
  only the fields physically retained by a retired transaction tombstone; and
- begin root resolution from surviving uncertain, aborted, unattempted, or
  host-attested-committed state; mint one process-local request identity at
  egress; apply either an exactly correlated ordinary-read terminal-complete
  observation or physical-database-absence terminal-open-error evidence with
  recoverable stale-ID rejection; restart the read under a distinct identity;
  classify the closed root outcomes; and exact-resubmit only advisory clean-
  absence retry eligibility from a non-host-committed source; and
- perform the nominally separate rotation resolution over the same source
  states, with shape-specific exact prior-selection, candidate namespace,
  generation, direct-competitor, direct-successor, index, and tombstone
  findings; source-aware retry/conflict/corruption precedence; and exact
  resubmission only from advisory non-host-committed clean absence; and
- snapshot one exact selected binding plus `Arc`-shared exact current/optional-
  predecessor JSON together with a canonical writer epoch/current-fence pair,
  compare it directionally across only `Retired -> Reclaimed` cleanup, and
  consume it into a checked non-`Clone` acquisition plan for exactly the next
  epoch and a proposed fence distinct from the current fence; and
- consume that plan into a fresh process-local acquisition attempt, expose one
  borrowed exact adapter request, correlate typed terminal host attestations to
  its egress-created request ID, retain negative terminal plans for exact
  resubmission, and issue a non-`Clone` revocable mutation token only from a
  matching acquisition-completed attestation; and
- consume one such token plus one active-tail cursor, validate their exact
  session/checkpoint/active-generation/Frame V1 relationship, encode and
  semantically admit one borrowed entry, and either return both unchanged
  owners on typed failure or quarantine the exact frame and speculative
  post-append cursor in a non-`Clone` append plan; and
- consume that plan into a nonempty FIFO under independent pending-frame and
  encoded-byte limits, then atomically enqueue borrowed entries at its
  speculative tail while retaining one root token, one final cursor, exact
  aggregate accounting, and an immutable head whose raw bytes and followers
  remain core-private; and
- consume that FIFO into uncertainty before egress, emit one borrowed exact
  head request under distinct process-local attempt/request IDs, exact-resubmit
  the allocation-identical queue under a fresh attempt ID, and keep accepting
  logical followers without making any follower physically dispatchable; and
- correlate trusted transaction-completed, transaction-aborted, or not-
  attempted callbacks; retain the complete queue on negative results; publish
  a separate head-present state on strict exact-tail completion; and consume
  that state to acknowledge exactly one head into a typed pending or drained
  owner; and
- enter same-process append resolution from uncertain, aborted, or
  not-attempted ownership while retaining honest optional append-request
  provenance; issue one borrowed exact-scope observational request under a
  fresh resolver ID; logically enqueue behind its immutable head while
  preserving correlation; classify closed physical findings against private
  head/selection bytes; exact-resubmit only clean exact-tail absence; and
  acknowledge only byte-identical exact-final-head presence through a
  resolution-specific one-head transition.

The v0.0.37 boundary checks typed host terminal evidence against one exact
prepared plan without treating per-transaction IndexedDB fencing as release of
an exclusive semantic owner. Version `0.0.38` adds directional selected-binding
and active-to-retired/reclaimed comparisons plus the closed retired-transaction
record shape. Version `0.0.39` adds the process-local root resolver state
machine; version `0.0.40` adds the nominally separate rotation resolver state
machine. Version `0.0.41` adds the non-authority mutation-fence binding and
acquisition plan. Version `0.0.42` adds the separate process-local acquisition
request/terminal/token lifecycle. Version `0.0.43` adds pure single-frame
append preparation. Version `0.0.44` adds the pure bounded append FIFO, but
still no IndexedDB implementation. Version `0.0.45` adds the process-local
append-head attempt/request boundary. Version `0.0.46` adds correlated terminal
observation and explicit one-head acknowledgement. Version `0.0.47` adds the
process-local lost-callback resolver, but no executable adapter or restart
reconstruction.

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
binding when present. The mutable writer epoch/fence remains excluded from
`LocalLogStorageSelectedBinding` and `LocalLogStorageSelectedRoot`. Version
`0.0.41` can separately snapshot that selected binding and its `Arc`-shared
exact JSON together with caller-supplied writer facts as
`LocalLogStorageMutationFenceBinding`. The pure constructor cannot prove that
those facts came from this scope control or were atomically co-observed. The
v0.0.42 borrowed acquisition request carries the exact retained envelope and
writer facts to the host, but only a conforming future adapter can perform the
fixed-scope observation and write. Candidate JSON can never select its own
authority.

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
expect the selected head; and seal the selected active generation under its
exact Frame V1 policy. It rejects a transaction equal to either retained
receipt, a proposed committed head equal to any retained committed or expected
head, a successor equal to the selected checkpoint/active generation or the
checkpoint generation decoded from the exact predecessor, and an activation
fence equal to either retained selected-generation activation fence. The
host/profile must still prove lifetime freshness beyond these known O(1)
identities. This closes the v0.0.32 bootstrap and garbage-collection deadlock
without weakening its immediate known-identity reuse protections.

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
- `chunks`: `[scopeId, scopeIncarnationId, logId, chunkStart]`.

Database and scope incarnations are distinct Rust types in `0.0.34`:
`LocalLogStorageDatabaseIncarnationId` and
`LocalLogStorageScopeIncarnationId`. Each is owned ASCII using exactly
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Syntax proves neither freshness nor
entropy. A database incarnation is lifetime-fresh for each physical profile
database establishment; a scope incarnation is lifetime-fresh within one
database incarnation and is never shared by two scope lifetimes. They are
non-secret and never interchangeable at a Rust or Wasm boundary.

`chunkStart` is exactly twenty ASCII decimal digits, zero padded on the left.
It is the generation-relative byte offset at which that value's complete frame
begins, not a frame count or record ordinal. This avoids JavaScript integer
precision and gives deterministic key ordering through
`18446744073709551615`. The first record starts at
`00000000000000000000`; each later start is exactly the preceding start plus
the preceding value's complete byte length. Starts and ends must fit `u64`.

Complete-prefix inspection uses an inclusive lower key
`[scopeId, scopeIncarnationId, logId]` and exclusive upper key
`[scopeId, scopeIncarnationId, logId + "\u0000"]`. The validated log-ID grammar
forbids NUL, so IndexedDB's lexicographic array/string ordering places every
longer key with the exact three-part prefix inside this range, regardless of a
malformed fourth component or extra components. A cursor requires every
observed key to be an exact four-part array whose last member parses as
canonical `LocalLogStorageChunkStart`, and every value to be exactly one
complete Frame V1 with no trailing bytes. It validates a first start of zero
and exact end-to-next-start continuity. A malformed key, empty or invalid
value, gap, overlap, truncated or multiple frame, trailing bytes, or generation-
relative end overflow is corruption.
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
never changed by this profile. Physical absence, an all-five-stores-empty
compatible database without the profile record, or a different valid
incarnation while resolving an older plan means storage was uninitialized,
cleared, recreated, or replaced; it never proves that the older plan did not
commit historically.

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
acquisition and every root-changing rotation. It never wraps. Advancing
`u64::MAX - 1` to `u64::MAX` is allowed, but no later acquisition or rotation
can advance the epoch. An already issued token at epoch maximum could still be
compared by append because append does not itself advance the epoch; epoch
exhaustion is therefore not a blanket assertion that the scope is immediately
read-only. A writer token is valid only for the exact database/scope
incarnation, selected head, active generation, epoch, and current writer-fence
ID that a mutation transaction rechecks. The immutable selection `fenceId` is
not rewritten when this mutable epoch changes.

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
When an already-retired transaction is used as a retired root candidate's
direct successor, the tombstone likewise proves only its retained
transaction/head identity and committed-head index. Its discarded JSON and
sealed-generation fields cannot be reconstructed or attested; the candidate's
planned active-generation `retiredBy` link is a separate retained relationship.

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

Chunk values are owned `ArrayBuffer` byte sequences. One record contains
exactly one complete Local Log Frame V1 and no trailing bytes. Its `chunkStart`
key is the frame's generation-relative byte start. This deliberate one-frame-
per-record layout makes complete-prefix inspection and exact idempotency
unambiguous, at the cost of one IndexedDB record and key per frame.

Version `0.0.43` adds only a pure append plan. Version `0.0.44` can seed a
nonempty bounded queue from that plan and append more semantically admitted
frames behind its immutable head. The queue retains the original token once,
one final speculative cursor, exact count/byte totals, and ordered frame
allocations. Version `0.0.45` can consume that queue into uncertainty before
egress and yield one borrowed request exposing only the immutable head's exact
bytes and comparison facts; that request exposes no follower raw bytes,
dispatch authorization, or final cursor. Version `0.0.46` can correlate the
trusted terminal callback, publish a separate head-present state after exact
completion, and acknowledge exactly one head into pending or drained ownership.

The v0.0.45 request binds that distinguished head to the complete expected
mutation-fence and selected bindings, exact current and optional predecessor
selection JSON, active generation/Frame V1 policy through that binding, writer
epoch/current writer-fence ID, canonical `chunkStart`, exclusive end, and exact
Frame V1 bytes. A future executable adapter must independently re-observe all
of those facts in the same five-store transaction, validate the complete chunk
cursor, and require the current tail end to equal the head's `chunkStart`
before adding its exact frame. An activation `fenceId`, a writer-fence string,
a plan, or a later queued frame by itself must never pass that boundary.

If the target key already contains the byte-identical complete planned frame
and no later record exists, the transaction may classify that exact plan as
idempotently present. Different bytes at the target, a gap, overlap, malformed
record, or any later record fails closed. This rule does not let a plan prove
its own currentness or durability.

One append request ID names one adapter invocation and at most one append-
capable transaction. The request borrow is one-shot, but its sensitive raw
frame and selection JSON can be copied, so it is not evidence of single
dispatch; `Debug` redacts those payloads. The uncertain owner must exist before
the request crosses the boundary. Returning the request, receiving success from
an individual IndexedDB request, or returning from `commit()` is not completion.
Exact resubmission uses a fresh attempt ID while retaining the identical queue,
head key/bytes, token, and speculative tail. It does not refresh a stale token,
and an older dispatched transaction may still commit, so every invocation must
implement the same-key/same-bytes idempotent shape above.

## Fixed transaction scope

Every profile publication, restart-resolution/fence acquisition, future
executable append, and payload cleanup transaction is created as:

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
outcome resolution carrying an expected incarnation treats physical database
absence, a different valid metadata incarnation, or an absent `meta/profile`
record with all five stores empty as `StorageResetOrIndeterminate`. Any record
in any store without valid profile metadata is `CollisionOrCorruption`. It must
never create a replacement record and then classify the older plan against it.

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
- retired root transaction with matching retained identities,
  `selectionByteLength`, exact candidate and direct-successor committed-head
  index mappings, and a case-specific direct-successor proof whose head matches
  the planned active-generation retirement: `ResolutionRetired`. If the
  successor remains the exact current predecessor, strict selected
  normalization privately retains its byte-derived sealed log ID and frame,
  and both must equal the root's planned active generation without another
  host-supplied scalar assertion. If the successor is already retired, its
  tombstone has discarded those JSON/sealed fields, so only retained
  transaction/head/index facts and the planned active generation's `retiredBy`
  link are proved—not the discarded successor contents. The retired root's
  supplied bytes are no longer profile-attested;
- absent scope and absent planned artifacts in the same known database
  incarnation: `RetryEligibleAtResolution` (advisory after the transaction);
- same ID with any different fact/byte: `CollisionOrCorruption`;
- another valid scope incarnation/head: `ScopeAlreadyProvisioned`; and
- physical database absence, a different valid metadata incarnation, or an
  all-five-stores-empty compatible database without `meta/profile`:
  `StorageResetOrIndeterminate`; any record without valid profile metadata is
  `CollisionOrCorruption`.

The retry-eligible and already-provisioned labels above apply to an uncertain,
aborted, or unattempted source. For a surviving `HostAttestedCommitted` source,
an absent or replaced planned scope lifetime is
`StorageResetOrIndeterminate`, while a still-present expected scope missing its
append-only candidate/index association is `CollisionOrCorruption`.

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
   candidate active-generation key, the complete selected active-generation
   chunk prefix, and the candidate active-generation chunk prefix;
3. requires the current control and selected transaction bytes to equal the
   exact-selection facts snapshotted in the rotation request, and compares the
   selected binding directionally: all immutable checkpoint/active-generation
   facts remain exact while checkpoint cleanup may only advance
   `retired -> reclaimed`; it also requires the candidate expected head to be
   selected;
4. requires the token's selected head, active log, writer epoch, and current
   writer fence to match exactly;
5. when `previousTransactionId` is non-null, requires that record to be
   `exact`, match its key and immutable identity fields, contain valid exact
   selection JSON, and have `committedHeadId` equal to the current selected
   rotation's `expectedHeadId`; root selections instead require null;
6. requires the candidate transaction, committed-head unique-index, and
   generation keys to be absent;
7. requires the complete candidate active-generation chunk prefix to be absent;
8. validates every selected active-generation chunk as one complete Frame V1
   at its canonical contiguous `chunkStart`, derives zero for an empty prefix
   or the exclusive end of the last frame, and requires that exact current tail
   end to equal the candidate manifest's `acceptedPrefixBytes`;
9. changes the validated old previous exact transaction, if present, to its
   retired tombstone while leaving the currently selected exact record intact;
10. changes the prior active generation record to `retired` by the candidate
   committed head;
11. `add()`s the candidate exact transaction record with exact canonical
    ordinary-rotation JSON;
12. `add()`s the exact empty active successor generation under the manifest's
    immutable activation fence; and
13. `put()`s the scope record selecting the candidate head/transaction, naming
    the formerly selected transaction as `previousTransactionId`, and advancing
    the writer epoch by exactly one with `currentWriterFenceId` equal to the
    candidate manifest's fence. Epoch exhaustion rejects the complete attempt.

The prior exact selection remains current until this entire transaction
commits. The successor cannot be partially selected, and retired payload chunks
remain unreachable but reclaimable. A request-level success in steps 9–13 does
not change the public outcome.

Publication preflight and later resolution classifications are branch-specific:

- an exact candidate selected as current, with exact candidate bytes/generation
  graph and plan prior-current transaction as its exact immediate predecessor:
  `CommittedSelectedAtResolution`; when the prior selection was a rotation, its
  optional older predecessor must now be the matching indexed tombstone;
- an exact candidate as immediate predecessor of a valid later current, with the
  candidate active generation now its exact retired/reclaimed checkpoint:
  `CommittedSuperseded`; the plan prior-current transaction and optional prior-
  predecessor must be matching indexed tombstones;
- a retired candidate with its matching indexed tombstone, both planned
  generation transitions, valid current graph, direct-successor proof, and all
  required prior indexed tombstones: `ResolutionRetired`; candidate byte length
  is collision screening and does not attest supplied bytes;
- candidate absent, exact plan prior selected envelope still current, and the
  candidate transaction, committed-head index, candidate active-generation
  key, and complete candidate active-generation chunk prefix all absent:
  `RetryEligibleAtResolution`, but only for an uncertain, aborted, or
  unattempted source and only as an advisory snapshot;
- the same intact-scope candidate absence after `HostAttestedCommitted`:
  `CollisionOrCorruption`;
- candidate namespace absent plus one exact direct competing rotation whose
  immediate predecessor is the plan prior current selection and whose
  generation/index/older-tombstone facts match:
  `DefinitelyNotCommittedConflict`, only for the three non-host-committed
  sources; and
- a conflicting candidate record/artifact, missing required index, invalid
  transaction or generation relationship, or malformed selected graph:
  `CollisionOrCorruption`.

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

Version `0.0.38` implements the three typed value prerequisites for resolution,
not a resolver or adapter. A later same-selection binding comparison keeps
current/predecessor receipts and every immutable generation fact exact while
allowing only checkpoint cleanup `Retired -> Reclaimed`; the reverse is a
regression. A selected active generation can separately validate that it became
the exact `retired` or `reclaimed` checkpoint under one supplied superseding
head. The closed retired-transaction binding contains only fields retained by
the tombstone, including `selectionByteLength`; it has no profile/session/JSON
facts, and equal length is not byte evidence. These helpers authenticate no
storage source and do not compare selection JSON.

Version `0.0.39` implements the process-local root resolver and version `0.0.40`
implements the nominally separate rotation resolver. Each boundary consumes one
surviving attempt state of its own plan shape and recoverably rejects the other
shape. One borrowed request mints one opaque shape-specific resolver request
identity at egress. Pre-egress or stale/cross-request evidence is rejected
without classification and returned with the unchanged resolver.
`restart_resolution` preserves the exact source plan and bytes while clearing
correlation; the next request ID is distinct and old evidence is stale. This is
a new in-process read invocation, not crash reconstruction.

Each ordinary resolver read reopens as needed and creates one later transaction
scoped to exactly all five stores in `readonly` mode, without a durability
option. It waits behind an earlier overlapping `readwrite`; a later overlapping
`readwrite` waits behind it, while compatible `readonly` transactions may run
concurrently. This establishes a stable no-write snapshot but cannot rule out a
copied publication transaction created after the resolver. An ordinary read
observation becomes applicable only when that exact resolver transaction emits
`complete` after all reads and range/prefix scans finish. Individual request
success, scan completion without transaction completion, abort, callback loss,
or an unrelated transaction's completion produces no classification. Root and
rotation requests, tokens, and evidence remain nominally separate:

Physical database absence cannot create that five-store transaction. Its
separate correlated `database_open_absent` assertion is valid only after a
versionless open reports `oldVersion == 0`, the handler synchronously aborts the
upgrade, and the open request emits terminal `error`. This is reset/
indeterminate evidence, never permission to let creation commit. An existing
database with a different valid meta incarnation uses the ordinary completed
read. So does a schema-compatible database without `meta/profile`: it is reset/
indeterminate only after all five stores are exhaustively observed empty. Any
record in any store without valid profile metadata is instead
`BrokenProfileAssociation::ProfileMetadata` and collision/corruption.

- A root resolver reads/validates meta, the planned scope, planned transaction
  key, planned committed-head index key, both planned generation keys and scope
  artifact ranges. When the candidate exists, it additionally validates the
  exact root selection, checkpoint-only generation, active generation, and
  scope-control association when selected; a later valid current plus exact
  root immediate predecessor when superseded; or immutable identity plus a
  case-specific direct-successor proof when retired. Selected/superseded/
  retired cases require the exact candidate `byCommittedHead` mapping; retired
  additionally requires stored candidate byte length and the successor's own
  index mapping. An exact successor must be the normalized current predecessor,
  whose privately retained byte-derived sealed log ID and frame must equal the
  root plan's active generation. An already-retired successor has no remaining
  JSON/sealed fields, so that path validates only its retained
  transaction/head/index facts and the planned active generation's `retiredBy`
  link. An absent scope is eligible only when every complete planned
  transaction/generation/
  chunk artifact range is empty in the expected database incarnation and the
  source is uncertain, aborted, or unattempted. A different valid scope is
  `ScopeAlreadyProvisioned` only for those three sources; a host-attested-
  committed source instead becomes reset/indeterminate in either case.
- The implemented `0.0.40` rotation resolver reads/validates meta, the expected
  scope control, candidate transaction and committed-head index, current
  transaction and head index, optional current predecessor, both current
  generation records, the candidate active-generation key, and branch-specific
  prior transaction/generation facts. Candidate-absence and conflict branches
  also exhaust the complete candidate active-generation chunk prefix. A retired
  branch may enqueue a dependent direct-successor lookup through
  `byCommittedHead`; the direct-conflict branch instead validates its exact
  competing current graph. Index mappings are validated, not inferred from a
  supplied receipt.

  Candidate absence requires current storage to match the complete snapshotted
  prior selection under `compare_later_observation` plus byte-exact current and
  optional-predecessor JSON. The candidate transaction, committed-head index,
  candidate active-generation key, and complete candidate active-generation
  chunk prefix must all be absent. Candidate selected instead requires the
  exact candidate JSON as current, the plan's prior-current transaction/JSON as
  its exact predecessor,
  the complete candidate generation graph, and the optional prior predecessor
  as an indexed tombstone only when the prior selection was a rotation.
  Candidate superseded requires a valid later current with the exact candidate
  as immediate predecessor, validates the candidate checkpoint generation as
  the plan prior active generation retired/reclaimed by the candidate head,
  validates the candidate active generation as that current's retired/reclaimed
  checkpoint, observes the plan prior checkpoint under directional cleanup, and
  requires indexed tombstones for the plan prior-current and optional prior-
  predecessor transactions.

  A retired candidate requires its matching indexed tombstone, the planned
  candidate checkpoint generation retired/reclaimed by the candidate head, the
  planned candidate active generation retired/reclaimed by the direct-successor
  head, the plan prior checkpoint generation under directional cleanup, and
  indexed tombstones for the plan prior-current and optional prior-predecessor
  transactions. Its direct successor is either the exact normalized current
  predecessor or an indexed retired tombstone. In the exact case, strict
  normalization privately retains the successor bytes' sealed log ID and frame,
  which must match the candidate active generation without a host-supplied
  scalar assertion. The retired-successor tombstone has discarded JSON/sealed
  fields, so that case proves only retained transaction/head/index facts and the
  candidate active generation's `retiredByHeadId` linkage—not the discarded
  successor contents. Candidate `selectionByteLength` remains collision
  screening rather than byte evidence. Every branch preserves both expected
  incarnations and fails closed on conflicting relationships.

For either shape, exact selected evidence is
`CommittedSelectedAtResolution`; an exact immediate predecessor is
`CommittedSuperseded`; a fully validated retired graph is `ResolutionRetired`
and does not attest the old supplied bytes; reused identities or broken
associations fail closed as collision/corruption; and a missing/different
incarnation is `StorageResetOrIndeterminate`. Rotation has no
`ScopeAlreadyProvisioned` outcome.

Absence is not one blanket outcome. A completely absent planned root scope with
every scope artifact range empty is `RetryEligibleAtResolution` only for an
uncertain, aborted, or unattempted source. A rotation whose exact prior
selection remains current and whose complete candidate namespace is absent has
the same advisory outcome only for those three sources. It is advisory once the
resolver transaction finishes because another copied dispatch may publish
later. For `HostAttestedCommitted`, candidate namespace absence while the
expected rotation scope still exists is `CollisionOrCorruption`, never retry or
conflict. Missing or replaced database/scope lifetime is instead reset/
indeterminate for every source.

For a non-host-committed rotation source, complete candidate namespace absence
plus one exact direct competing rotation is
`DefinitelyNotCommittedConflict`; the immutable candidate can no longer pass
its expected-head comparison and cannot exact-resubmit. The competing current
must name the plan prior current receipt and exact JSON as its immediate
predecessor. Its checkpoint generation is the plan prior active generation in
the exact retired/reclaimed state under the competing head, its current head
index must match, the plan prior checkpoint follows directional cleanup, and an
optional older predecessor must be the matching indexed tombstone. An arbitrary
far-later current is outside the `0.0.40` observation contract and must fail
closed. Candidate presence that is neither current, immediate predecessor, nor
a valid retired tombstone is corruption, not retry or conflict.

If resolution and retry are combined, comparison and all retry writes remain in
that same transaction. Otherwise the later publication attempt must repeat
every comparison and authority check; a prior inspection is not a compare-and-
swap. For either shape, physical database absence, a different valid metadata
incarnation, an all-five-stores-empty compatible database without
`meta/profile`, or a missing/replaced planned scope lifetime is
`StorageResetOrIndeterminate`. Any record in any store without valid profile
metadata is `CollisionOrCorruption`. When the expected database and scope still
exist, a host-attested source missing its append-only candidate transaction or
committed-head association is also `CollisionOrCorruption`. An uncertain,
aborted, or unattempted root source may receive advisory retry after complete
planned-scope/artifact absence, while another complete valid root scope is
`ScopeAlreadyProvisioned`. The equivalent rotation source requires the exact
prior envelope plus complete candidate namespace absence for advisory retry, or
the exact direct competing rotation above for nonretry conflict.

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

Version `0.0.41` supplies only the pure comparison and planning prerequisites
for acquiring a revocable storage-mutation token. A
`LocalLogStorageMutationFenceBinding` contains the complete selected binding,
`Arc`-shared byte-exact current and optional predecessor JSON, and one
caller-supplied writer epoch/current-fence pair. Its later-observation action
first compares the selected binding directionally, accepting only checkpoint
cleanup from `Retired` to `Reclaimed`, then requires the two exact JSON values,
epoch, and current fence to remain unchanged. Reverse cleanup and every writer
change reject. Structural equality is deliberately stricter than this
directional comparison.

Consuming that binding with
`try_prepare_writer_fence_acquisition(proposedWriterFenceId)` computes exactly
the nonwrapping successor epoch. It returns a checked non-`Clone` plan only if
the proposed fence differs from the observed current fence. If the epoch is
already `u64::MAX`, or if the proposed fence is equal, the recoverable failure
retains both complete unchanged inputs; exhaustion has precedence. The local
inequality check is not proof that the proposed identity is lifetime-fresh.
The plan exposes no raw selection JSON, and its `Debug` representation remains
payload-redacted.

Multiple callers can prepare the same next epoch and proposed fence. That tuple
cannot attribute a later commit to one caller. Token issuance must remain
correlated to the exact request whose acquisition transaction emitted terminal
`complete`; observing the target tuple later is not equivalent.

Version `0.0.42` implements that process-local correlation boundary without
implementing IndexedDB. `begin_acquisition` consumes the plan into an uncertain
state and creates a fresh opaque attempt ID before egress. The first
`adapter_request` call permanently records egress, creates a distinct opaque
request ID, and yields one borrowed non-`Clone` request. It exposes the complete
expected selected binding, exact current and optional-predecessor JSON,
expected epoch/fence, and planned successor epoch/proposed fence. Its raw JSON
is the narrow public payload surface; request and state diagnostics report only
facts and lengths.

A conforming future IndexedDB host must execute that request as exactly one
fixed five-store strict `readwrite` transaction. In its creation task and
request callbacks it must:

1. read and validate `meta/profile` and `scopes/scopeId` for the expected
   database and scope incarnations;
2. read the expected selected transaction by its primary key and independently
   read `transactions.byCommittedHead` at
   `[scopeId, scopeIncarnationId, committedHeadId]`; the unique index result
   must be that same exact transaction record;
3. read the optional immediate-predecessor transaction when named and the
   selected checkpoint and active generation records, then reconstruct the
   complete observed selected envelope from those records;
4. directionally compare that observed envelope with the request binding,
   allowing only checkpoint cleanup from `Retired` to `Reclaimed`, and compare
   both retained JSON byte strings exactly;
5. require the scope control's `writerEpoch` and `currentWriterFenceId` to equal
   the request's expected pair; and
6. only after every read and comparison succeeds, update that same scope record
   by replacing only the writer pair with the exact planned successor epoch and
   proposed fence. The selected head, transaction IDs, selection kind, session,
   incarnations, transaction/index records, generation records, and JSON remain
   unchanged.

Every comparison and the scope write is part of that one transaction. The
adapter must abort on mismatch; it must never reinterpret “target pair already
present” as success, because a value-identical contender or copied dispatch may
have written it. As elsewhere in the profile, no promise or unrelated task may
separate the final successful comparison from enqueueing the write. Only that
exact request's transaction `complete` qualifies for acquisition completion.

The terminal kinds are `AcquisitionCompleted`, `TransactionAborted`, and
`NotAttempted`. Completion and abort attestations require a clone of the opaque
request ID emitted at egress, while not-attempted names the attempt and means
that invocation created no transaction. Consuming observation checks attempt
identity, then whether transaction evidence was even issuable, then request
allocation identity. A rejection retains the unchanged owner and unapplied
attestation. Abort and not-attempted retain the exact plan and allocations for
a fresh-attempt exact resubmission; an uncertain attempt may also be exactly
resubmitted, but an earlier transaction can still complete.

Only matching `AcquisitionCompleted` produces
`LocalLogStorageMutationToken`. The token retains the exact nominal request ID
and a post-acquisition binding that preserves the complete selected envelope
and exact JSON allocations while replacing only epoch/fence with the plan's
target pair. It is non-`Clone`, nonserializable, and privately constructed.
Public inspection exposes its binding, selected binding, acquired pair,
attempt/request IDs, and JSON lengths, but not raw JSON.
Non-`Clone` is ownership hygiene rather than linear enforcement: callers can
retain references or wrap it in shared ownership. Another acquisition or
rotation may revoke it before its callback runs, so every append and rotation
must recheck the token's exact selected envelope, active log, writer epoch, and
current writer fence inside that mutation's own transaction. Acquiring a token
does not invalidate the immutable selected-root summary merely because its
epoch advanced; a mutation uses both values and rejects if either no longer
matches storage.

Attempt IDs, request IDs, epochs, and fences are non-secret correlation values,
not authentication or capabilities by themselves. Rust allocation identity
rejects stale/cross-request attestations only within the surviving process; it
does not authenticate a host callback. The borrowed one-shot request cannot
stop a host from copying its data or dispatching it twice, and copied dispatch
effects are outside the nominal one-request/one-transaction contract.

The maximum epoch creates a terminal liveness hazard. If an acquisition from
`u64::MAX - 1` commits `u64::MAX` but its `complete` callback is lost, an exact
resubmission observes a writer mismatch rather than proving which transaction
won. If the process restarts, its attempt/request identities and plan are also
gone. The stored target tuple cannot safely reconstruct the token, yet no
further acquisition or rotation can increment the epoch. Profile V1 defines no
resolver or in-place recovery for this case; recovery requires a later profile,
migration, or out-of-profile reset. A maximum-epoch token already issued before
loss can still prepare an append and could be checked by a future adapter.

Version `0.0.43` adds the pure append-preparation boundary without adding an
adapter or request lifecycle. `LocalLogStorageMutationToken::try_prepare_append`
consumes one token and one `LocalLogTailCursor` while borrowing one
`LocalLogEntry`. It requires the token-selected session, checkpoint generation,
active generation, and Frame V1 policy to match the cursor; deterministically
encodes one complete frame; and submits those exact bytes through the cursor's
existing atomic semantic-admission transition. A typed failure returns the
complete unchanged token and cursor, while the entry remains caller-owned.

Success returns a private-constructor non-`Clone`
`LocalLogStorageAppendPlan`. The plan owns the retained token, exact frame,
canonical `LocalLogStorageChunkStart`, exclusive frame end, admission outcome,
and speculative advanced cursor. Shared inspection exposes only bindings,
bounded facts, and the quarantined cursor; there is no public raw-frame or
consuming-parts accessor. The post-cursor is not durable and cannot be
continued through this surface. `Debug` remains payload-redacted.

Version `0.0.44` adds a pure nonempty `LocalLogStorageAppendQueue`.
`LocalLogStorageAppendPlan::try_into_queue` consumes one checked plan under
immutable host-selected `LocalLogStorageAppendQueueLimits`. Start validation
checks pending-frame capacity before aggregate encoded-byte capacity and
returns the exact unchanged plan on rejection. Limits are independent, may be
zero, and default to 1,024 pending frames and 64 MiB of retained encoded bytes.
Success preserves the token, first frame allocation, and speculative cursor as
one structurally distinguished queue head.

`LocalLogStorageAppendQueue::try_enqueue` borrows another `LocalLogEntry` and
checks pending-frame count arithmetic and policy, deterministic frame encoding,
fixed-width frame and aggregate-byte arithmetic and policy, then the existing
atomic semantic tail transition. Capacity is therefore rejected before cursor
advancement. Success adds the same encoded allocation at the FIFO back and
publishes one final speculative cursor advanced through the complete pending
prefix. Its success step owns the updated queue and reports the new frame's
bounded range, length, and admission outcome. Every typed failure returns the
complete unchanged queue; the entry remains caller-owned.

The queue exposes exact pending and remaining count/byte capacity, the final
speculative cursor/end, and only the immutable head's start, end, encoded
length, and admission outcome. Its enqueue success step reports only the newly
admitted frame's bounded causal metadata; this is not a persistent or arbitrary
follower view. It has no public raw frame, follower selection, pop, discard,
reorder, coalesce, request, acknowledgement, cursor-release, or rotation edge.
The original token remains once at the root and does not become a currentness
proof.

Version `0.0.45` consumes that queue into a non-`Clone` uncertain append-head
attempt before egress. Its first `adapter_request` permanently records egress,
mints nominal process-local attempt/request correlation, and lends one
non-`Clone` request for only that head. The request includes the full expected
mutation-fence/selected binding, byte-exact current and optional predecessor
selection JSON, expected writer pair, exact start/end/length, and complete
Frame V1 bytes. Those payloads are sensitive and externally copyable and are
therefore omitted from `Debug`. One request ID names one invocation and at most
one append-capable transaction; the one-shot Rust borrow cannot prove that the
adapter did not dispatch copied bytes elsewhere.

In one fixed five-store strict `readwrite` transaction an executable adapter
must revalidate the complete token binding, selected transaction and head index,
checkpoint and active-generation metadata, exact retained selection bytes,
writer epoch/fence, and active Frame V1 policy. It must inspect the complete
active-generation chunk prefix. When the target key is absent, the valid prefix
must end exactly at the queue-head start before the adapter may add only the
head's exact frame. When the target is already the valid final record, the
prefix immediately before it must end at the queue-head start, its key and
bytes must match exactly, and no later record may exist; only then is the head
idempotently present. Any other target bytes, later record, gap, overlap,
malformed key/value, or binding mismatch fails closed. Request return,
individual request success, and `commit()` return do not complete the append.

Exact resubmission changes only the attempt identity/request eligibility and
preserves the allocation-identical queue, head bytes, token, limits, followers,
and speculative cursor. It does not renew a stale token; the prior request may
still commit, so every invocation repeats the same serialized exact-tail and
same-key/same-bytes checks. Logical enqueue remains available before and after
request egress, preserves attempt/request IDs, and advances only the private
tail. No core-issued request exposes or authorizes a follower. At the `0.0.45`
checkpoint, only a future terminal and acknowledgement transition could remove
the head and publish a drained owner eligible for cursor release. Version
`0.0.45` had no such terminal, pop, drain, resolver, rotation, or restart
transition; those remained the next implementation gate at that checkpoint.

Version `0.0.46` adds
`LocalLogStorageUncertainAppendAttempt::observe_terminal_attestation`. Its
current attestation kinds are `TransactionCompleted`, `TransactionAborted`, and
`NotAttempted`. Completed and aborted callbacks correlate the exact emitted
request ID; not-attempted correlates the attempt ID and is legal before or after
egress. Error precedence is fixed: attempt-ID mismatch, then, for request-
bearing evidence, request not issued and request-ID mismatch.
`LocalLogStorageAppendTerminalFailure` returns both
the unchanged uncertain owner and exact attestation. These callbacks are
trusted profile attestations. The Rust core does not authenticate the browser
event or physical storage, and the terminal surface accepts no raw encoded
frame payload or host-selected pop.

`TransactionCompleted` may produce
`LocalLogStorageAppendTerminalOutcome::HeadPresent` only when the adapter
attests terminal `complete` for the whole strict five-store transaction and one
exact-final-tail condition. The transaction must revalidate the complete token
binding, both selected-transaction lookup paths, selected checkpoint and active
generation, exact current/predecessor selection JSON, expected writer pair,
active Frame V1 policy, and complete serialized tail. It must either add the
exact requested frame where an absent target equals the exact previous tail, or
observe that same key and byte-identical frame as the exact final record with a
valid prefix ending at its start. Individual request success, calling
`commit()`, partial store work, different bytes, a gap, overlap, malformed
record, or later record is never `HeadPresent`.

Positive classification remains separate from removal.
`LocalLogStorageAppendHeadPresent::acknowledge_head` consumes the positive state
and advances exactly one FIFO head. A
`LocalLogStorageAppendHeadAcknowledgementOutcome::Pending` owns
`LocalLogStorageAppendHeadAcknowledged`, promotes the allocation-identical first
follower, preserves FIFO order, token, limits, and final speculative cursor,
and decrements counts/bytes by exactly the acknowledged head. The queue must
begin another attempt, issue another request,
and receive another matching completed attestation before that promoted head
can be acknowledged. `Drained(LocalLogStorageAppendQueueDrained)` owns the
token, final cursor, limits, acknowledged request ID, and bounded acknowledged-
head metadata and is the only successful edge that releases the final cursor.

`AttemptAborted(LocalLogStorageAppendAttemptAborted)` and
`NotAttempted(LocalLogStorageAppendNotAttempted)` remove nothing and preserve
the allocation-identical complete queue for `begin_exact_resubmission` under a
fresh attempt ID with restored one-shot request eligibility. A copied request
may outlive either negative attestation and still commit, so same-key/same-bytes
idempotency remains mandatory. The token may be
stale, and the base cursor remains caller-trusted.

Version `0.0.47` implements same-process append lost-callback resolution over
the queue-owning `Uncertain`, `AttemptAborted`, and `NotAttempted` sources. It
preserves the exact source attempt ID, an honestly optional source request ID,
the complete queue and allocation graph, mutation token, counters, limits, and
final speculative cursor. Each resolver invocation emits at most one borrowed
request and mints its fresh opaque resolution ID only at egress. Restart
preserves the source but makes old evidence stale. A completed request borrow
may be followed by logical enqueue behind the immutable head without changing
either correlation identity; enqueue rejection returns the unchanged resolver.

The request carries the expected typed selected scalar binding, writer pair,
active Frame V1 limit, head start/end/length, and expected selection JSON
lengths. It does not expose the complete clonable mutation binding, private
expected frame, or exact selection JSON. The adapter
must independently normalize the observed current selection into a non-`Clone`
`LocalLogStorageSelectedRoot`; the observation constructor consumes that root
with writer epoch/fence and the transaction ID independently read through
`byCommittedHead`. It does not accept a mutation binding directly, keeping the
evidence shape on the strict normalization path, and its complete mutation
binding remains core-private. Retained or renormalized identical input can
still be supplied. Fresh independent I/O and atomic co-observation remain host
obligations.

Ordinary evidence comes from one exact five-store `readonly` transaction with
no durability option. The transaction must validate meta and scope control,
normalize the selected envelope and both transaction lookup paths, validate
checkpoint/active-generation metadata and Frame V1 policy, independently read
the writer pair, and fully scan the selected active-generation prefix. Evidence
is applicable only after terminal `complete`. A physically absent database uses
the separately correlated aborted non-creating versionless open; an existing
compatible database without profile metadata is reset only when every store is
exhaustively empty.

The host reports physical shapes; only Rust classifies them. Clean target
absence at the exact valid tail yields `RetryEligibleAtResolution` only when
the complete selected envelope, exact current/optional-predecessor JSON, and
writer pair remain exact, apart from valid retired-to-reclaimed checkpoint
cleanup. A byte-identical target yields `HeadPresentAtResolution` only when it
is the exact final record after the exact prefix. A later writer epoch is
compatible with that historical fact; a regressed epoch, a selected-receipt
change without a strict epoch advance, or a different fence at the same epoch
is a collision. A later record always blocks positive acknowledgement, and
target absence followed by a later key is a gap. A valid different current
selection with a strictly later epoch is indeterminate; another lifetime or
inconsistent same-receipt facts fail closed.

Only the positive state has a resolution-specific acknowledgement method; it
advances exactly one head through the same private FIFO primitive and returns a
resolution-specific pending or drained owner. Only the retry-eligible state can
begin a fresh exact append attempt. Every other result quarantines the queue
without retry, removal, cursor release, or writer authority.

This boundary remains host-attested, process-local, and observational. It does
not execute IndexedDB, authenticate callbacks, cancel copied requests, refresh
a token, prove durable/current media state, or survive process loss. Full tail
scanning is O(chunks), the observed frame is moved into one bounded
`Box<[u8]>`, and the fixed five-store scope still orders the resolver against
otherwise independent writers. `durability: "strict"` remains only an
IndexedDB hint.

Rotation uses the same tail authority. Its serialized transaction must inspect
the complete old active-generation prefix and require the current exact last
tail end to equal the manifest's `acceptedPrefixBytes` before it can retire
that generation and select the successor. Because append and rotation overlap
the same five stores, one completes before the other validates this condition;
neither can silently commit against a stale sealed-prefix assumption.

Pure IndexedDB V1 provides fencing at each mutation, not a long-lived exclusive
lock between transactions. No finite postcommit recheck removes that race. A
future profile may additionally hold a separately specified Web Lock, but this
profile neither requires nor inherits one. `fenceId`, a JavaScript object
reference, a receipt copied from another run, and a successfully decoded
manifest are insufficient separately.

Consequently this profile can never release a long-lived exclusive writable
`breditor-core` cursor or session. An already returned Rust owner cannot be
synchronously revoked when another browser transaction advances the epoch.
Versions `0.0.43` through `0.0.47` implement a transaction-coupled speculative
policy by quarantining one advanced cursor, then a bounded exact pending prefix,
then one uncertain-head request, and finally one-at-a-time trusted completion
and cursor release when drained. That release is revocable historical evidence,
not a held lock: the returned token can already be stale before its next use.

Profile `0.0.33` freezes these obligations. Version `0.0.41` implements the
canonical epoch, exact non-authority mutation-fence binding, directional
comparison, and checked acquisition plan. Version `0.0.42` implements only the
process-local request/terminal/token boundary around that plan. Version
`0.0.43` implements the pure append plan and quarantined speculative cursor;
version `0.0.44` implements the pure bounded FIFO and its atomic logical
enqueue; version `0.0.45` implements the uncertain-head request boundary; and
version `0.0.46` implements trusted terminal correlation and explicit one-head
acknowledgement; version `0.0.47` implements process-local observational append
resolution. None proves storage provenance, authenticates atomic co-
observation or browser events, performs CAS or I/O, establishes global fence
freshness, reconstructs authority after restart, or releases a durable exclusive
Rust writer. Those remain later design gates.

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
  through `0.0.47`; the implemented Rust values, attempt states, resolvers,
  writer-fence acquisition lifecycle, append plan/FIFO, uncertain append-head
  request, terminal, and acknowledgement boundaries perform no I/O.
- Root preparation/encoding/decoding, selected receipt/generation bindings,
  root/rotation normalization, and selected-root-aware next-rotation validation
  prove only bounded value and cross-link consistency. They do not provision a
  database, scope, head, checkpoint generation, or empty active generation.
- No pure-Rust value proves CAS or current-head status, global ID/fence
  freshness, physical generation emptiness, provenance or atomic co-observation
  of the represented mutable writer epoch/fence, authenticated browser-event
  provenance, durability, or ownership release. The v0.0.42 token is revocable
  process-local authority derived from a trusted host attestation; it is not
  independent proof that its binding is still current.
  The v0.0.37 terminal states validate process-local correlation around trusted
  host assertions only, and v0.0.39/v0.0.40 root/rotation resolver evidence is
  another trusted process-local host assertion rather than authenticated
  IndexedDB provenance. The attempt and resolver requests contain no adapter or
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
- Writer-fence acquisition attempt/request IDs and plans are likewise volatile
  and non-secret. The core has no acquisition resolver and cannot reconstruct a
  token from persisted epoch/fence values. Losing the completion callback or
  process state after committing the final epoch can permanently prevent a new
  Profile V1 acquisition without migration or reset.
- The append attempt/request IDs and terminal states remain process-local and
  volatile. Version `0.0.46` adds correlated terminal classification and one-
  head acknowledgement; version `0.0.47` adds a separately correlated same-
  process resolver. There is still no transition from the drained append owner
  into rotation or restart representation.
- One append attempt yields at most one borrowed request, but its raw frame and
  selection JSON can be copied and externally dispatched more than once. One
  request ID names one invocation and at most one append-capable transaction;
  it cannot authenticate browser-event provenance or prove single dispatch.
  Request return, individual request success, and `commit()` return are not
  completion. A copied request can outlive an aborted/not-attempted attestation
  and still race to commit.
- Append-queue limits count retained encoded frame slots and bytes only. They do
  not bound the cursor's editor session, history, replay indexes, decoded
  entries, queue/`Arc` metadata, shared selection bindings, or allocator
  overhead. Enqueue fully encodes one candidate before checking aggregate
  retained-byte capacity, so transient peak memory may exceed that ceiling.
  Allocation failure and panic are outside typed recovery.
- Safe Rust may drop the whole volatile append queue. Drop is neither
  cancellation nor acknowledgement and loses its token, speculative cursor,
  and pending frames. Recovery requires durable storage plus separately
  retained application intent; v0.0.47 has no restart or stale-token rebase.
  After request egress, drop or process loss also cannot decide whether copied
  or dispatched work committed.
- `LocalLogTailCursor::from_trusted_parts` leaves physical tail-byte provenance
  caller-trusted. The append plan validates internal identity, frame-policy,
  encoding, arithmetic, and semantic admission consistency; it cannot prove
  that its input cursor describes the current IndexedDB tail.
- Non-`Clone` tokens, append plans, and queues are ownership hygiene, not
  language-level linear authority: callers can retain references or place
  values behind shared ownership. The storage transaction remains the
  authority boundary.
- All writes serialize across all scopes because IndexedDB scheduling is
  object-store-granular and the profile deliberately fixes one common scope.
- Exact append-tail validation may scan every chunk in the active generation;
  Profile V1 persists no separately authenticated constant-time tail summary.
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
  or another separately specified lifetime-authority protocol, is still
  required. Version `0.0.46` releases a drained cursor only from a trusted
  transaction-coupled acknowledgement, and the returned token may be stale.
- The nonempty chunk layout is fixed at one complete Frame V1 per record. This
  adds record/key overhead and deliberately provides no multi-frame chunking or
  batching format. Executable adapter append/flush, aggregate tail replay, and
  crash-tail truncation remain undefined; the Rust acknowledgement is only a
  consuming transition from trusted terminal evidence.
- The v0.0.46 terminal/acknowledgement boundary owns correlation and exact one-
  head advancement. Negative states preserve the complete queue for exact
  resubmission; a pending positive promotes only the first follower; a drained
  positive owns token, final cursor, and limits. Version `0.0.47` adds same-
  process lost-callback resolution; a transition from the drained append owner
  into rotation and process-restart reconstruction remain later work.
  The host owns
  asynchronous scheduling, batching
  choice, backpressure, cancellation, browser task lifetime, and rate limiting,
  but may dispatch only the head and may not coalesce or reorder queue items.
  Dropping the owner is volatile loss, not cancellation or acknowledgement.
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

Version `0.0.38` adds directional same-selection comparison, exact
active-to-retired/reclaimed validation, the record-shaped retired-transaction
binding, and stable payload-free changes/errors. None is storage evidence.

Version `0.0.39` implements the request-correlated root resolver, ordinary-read
terminal-complete and physical-absence terminal-open-error evidence boundaries,
source-aware classifications, ownership-preserving stale-ID failure, restart
under a fresh resolver identity, and advisory exact retry from clean non-host-
committed absence.

Version `0.0.40` implements the nominally separate rotation resolver with the
same correlation and terminal-evidence discipline. It adds exact prior-envelope
absence, selected/superseded/retired positive graphs, exact direct-competitor
conflict evidence, source-aware host-committed corruption precedence, branch-
specific generation/index/tombstone checks, and advisory exact retry only from
clean non-host-committed absence. Arbitrary far-later conflict classification
remains a later extension.

Version `0.0.41` implements the canonical nonzero `u64` writer epoch, the
cloneable exact mutation-fence binding, its directional cleanup-aware
comparison, and consuming preparation of a checked non-`Clone` acquisition
plan. The binding retains the full selected binding and `Arc`-shared exact
current/optional-predecessor JSON together with the writer epoch/current fence;
public inspection and `Debug` do not reveal the JSON. The plan derives exactly
the next epoch and rejects only epoch exhaustion or equality between proposed
and current fences, returning both inputs on failure. It does not prove storage
provenance, atomic co-observation, CAS, or global fence freshness and issues no
request, terminal evidence, token, authority, owner, or append operation.

Version `0.0.42` implements the request-correlated acquisition lifecycle. It
consumes the checked plan into a fresh attempt, exposes one borrowed request
with the exact selected envelope and writer pairs, and accepts
`AcquisitionCompleted`, `TransactionAborted`, or `NotAttempted` host
attestations under exact attempt/request correlation. Negative outcomes retain
the allocation-identical plan for resubmission; only exact terminal completion
issues a non-`Clone` revocable token carrying the post-acquisition binding and
nominal request identity. Rejected observations retain both owner and evidence,
and diagnostics redact raw JSON.

Version `0.0.43` implements the pure single-frame append-preparation action and
canonical `LocalLogStorageChunkStart`. The action consumes a revocable token
and active-tail cursor, borrows one entry, validates their selected identity and
Frame V1 relationship, encodes and semantically admits one exact frame, and
quarantines the speculative post-cursor in a private-constructor non-`Clone`
plan. Typed failure returns both unchanged owners. It creates no adapter
request, physical attempt, terminal state, acknowledgement, resolver, or I/O.

Version `0.0.44` implements the pure nonempty bounded append FIFO. A checked
plan can enter only under immutable frame-count and aggregate-byte limits;
rejection returns the exact plan. Enqueue prepares one borrowed entry at the
final speculative tail and either retains the exact frame allocation behind the
unchanged head or returns the complete unchanged queue. The queue owns one
token, one final speculative cursor, exact pending totals, and ordered private
frames while its shared view exposes only head metadata and remaining capacity.
The enqueue success step separately reports its just-admitted frame's bounded
causal metadata. It has no raw-byte egress, arbitrary follower selection, pop,
acknowledgement, drained state, or rotation edge.

Version `0.0.45` adds the process-local uncertain-head attempt and exact request
boundary. It enters uncertainty before egress, permits one borrowed request for
the immutable head under distinct attempt/request IDs, and carries the full
binding, exact current/optional-predecessor selection JSON, expected writer
pair, and exact head key/range/bytes. Exact resubmission keeps the complete
queue allocation-identical under a fresh attempt ID without refreshing its
token; an older request may still commit. Logical enqueue can continue while
uncertain, but no core-issued request exposes or authorizes a follower. Request
return, individual request success, and `commit()` return are not terminal
evidence.

Version `0.0.46` adds trusted, exact-correlation terminal observation and the
separate consuming acknowledgement. Terminal kinds are
`TransactionCompleted`, `TransactionAborted`, and `NotAttempted`; correlation
errors prefer attempt mismatch, then, for request-bearing evidence, missing
request egress and request mismatch, and retain both owner and attestation.
Completed evidence may publish
`HeadPresent` only for a complete strict five-store transaction and exact added-
tail or byte-identical exact-final-tail qualification. One explicit
`acknowledge_head` advances one item into either a pending owner that promotes
the exact first follower or a drained owner retaining the token, final cursor,
and limits. Negative states advance nothing and preserve the exact queue for
resubmission.

Version `0.0.47` adds the non-serializable append resolver over all three
queue-owning source states. Its borrowed request has distinct correlation and
keeps expected frame/selection bytes private. A completed five-store
`readonly` snapshot supplies closed physical facts; Rust alone derives clean-
absence retry, byte-identical exact-final-head presence, or a quarantined
indeterminate/collision/reset result. Writer epoch movement is directional,
later records never acknowledge, logical enqueue preserves both correlations,
and positive presence still requires the separate resolution-specific one-head
acknowledgement. This is process-local host evidence, not executable I/O or
restart recovery.

The Profile V1 `chunks` layout is now one complete Frame V1 per value, with no
trailing bytes, keyed by its canonical twenty-digit generation-relative byte
start. A future append transaction must recheck the full token binding and
observed last tail end; byte-identical data at the exact target may be
idempotently present. Rotation must compare the same tail end against
`acceptedPrefixBytes` so serialized append and rotation cannot race across the
sealed boundary.

These releases do not execute the fixed-scope IndexedDB transaction, inspect or
authenticate a browser event, prevent copied dispatch, resolve a lost
acquisition callback, or reconstruct state after restart. Append callback
resolution works only while its exact volatile v0.0.47 owner survives. A copied
request may outlive a negative attestation; token currentness and the base
cursor's physical provenance remain outside the terminal callback.
The writer-fence acquisition contract includes an exact primary-key and
`byCommittedHead` index read of the selected transaction, complete selected-
envelope/generation and writer-pair comparison, and a scope-control-only
writer-pair update in one strict five-store transaction. The append contract
repeats those authoritative reads and the writer-pair comparison but may add
only the exact head chunk, or write nothing for the byte-identical exact-final-
tail branch; append must not update the writer pair. A JavaScript adapter and
real-browser profile validation remain later work. One-frame-per-record overhead, caller-trusted
cursor provenance, fixed-scope cross-editor serialization, and non-`Clone`-only
ownership hygiene are explicit limitations.

The implemented terminal/acknowledgement owners fix logical preparation order,
request correlation, and exactly-one-head advancement. The v0.0.47 resolver
adds process-local missing-callback classification; process-restart
reconstruction and a transition from the drained append owner into rotation
remain later work.
Host scheduling, batching
choice, backpressure, and cancellation remain outside the deterministic state
machine and may not bypass its head. The drained cursor release is transaction-
coupled trusted evidence, not a stable exclusive lock, and its token may
already be stale. `durability: "strict"` remains only an IndexedDB hint.
