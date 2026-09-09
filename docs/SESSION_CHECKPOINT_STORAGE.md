# IndexedDB session-checkpoint storage

Status: supported by the optional public `0.1.0` autosave path; the exact
`"current"` V1 record remains the stable `0.1.x` profile. Version `0.2.0`
retains the explicit profile-bound V2 outer record and scoped slots without
changing the legacy bytes. Direct store/autosave assembly remains an advanced
integration surface.

Profile identifier: `breditor/indexeddb-session-checkpoint`

Physical storage-profile version: `1` (record envelopes are explicitly versioned
`1` and `2`)

Database: `breditor-session-checkpoint-v1`, version `1`

This is Breditor's small, executable browser autosave profile. One store owner
is bound to one slot and stores one complete Rust `SessionCheckpoint` there.
Different exact slots can coexist in the same object store. It is deliberately
separate from [`INDEXEDDB_STORAGE_PROFILE.md`](INDEXEDDB_STORAGE_PROFILE.md):
that document specifies a multi-generation local log, while this profile is a
per-slot atomic replacement with compare-and-swap conflict detection.

The Rust checkpoint remains authoritative for document, selection, pending
formats, undo, redo, and history merge behavior. JavaScript owns IndexedDB
connections, transactions, storage generation, byte counting, and digest
verification. IndexedDB records and handles never cross into Rust.

## Exact database shape

The physical database version remains 1 and has exactly one object store:

- name: `checkpoints`;
- out-of-line keys (`keyPath === null`);
- `autoIncrement === false`;
- no indexes.

The stable `0.1.x` mode has at most one record, under the exact key
`"current"`. Alpha.6 profile-bound mode may retain one record under each exact
selected slot; it never scans or treats the set of slots as a document registry.

A stored record is a closed object with these own data properties and no
others:

```json
{
  "format": "breditor/indexeddb-session-checkpoint",
  "formatVersion": 1,
  "slot": "current",
  "generation": "1",
  "checkpointUtf8Bytes": 123,
  "checkpointSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "checkpointJson": "{...canonical Session Checkpoint V1 JSON...}"
}
```

Alpha.6's profile-bound outer record has exact version `2` and adds the binding
that was selected before the load:

```json
{
  "format": "breditor/indexeddb-session-checkpoint",
  "formatVersion": 2,
  "slot": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "schemaFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "checkpointFormatVersion": 2,
  "generation": "1",
  "checkpointUtf8Bytes": 123,
  "checkpointSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "checkpointJson": "{...canonical Session Checkpoint V2 JSON...}"
}
```

Outer record version and inner checkpoint version are independent fields. An
explicitly scoped base-profile store uses outer version 2 with
`checkpointFormatVersion: 1`; an extension profile uses checkpoint version 2.
A slot is 1 through 128 ASCII bytes, begins with an ASCII letter or digit, and
then permits letters, digits, `.`, `_`, `:`, and `-`. The schema fingerprint is
the canonical `sha256:` form. The binding is exact: slot, fingerprint, and
checkpoint format version all participate in record admission and token
ownership.

`generation` is a canonical nonzero decimal `u64` storage counter. It is not a
document revision, snapshot lineage, checkpoint version, lock, timestamp, or
writer identity. `checkpointUtf8Bytes` is the exact UTF-8 length and cannot
exceed 16 MiB. The digest is lowercase SHA-256 over those exact UTF-8 bytes.
It detects accidental or partial alteration; it is not authentication because
other same-origin code can replace the bytes and recompute it.

The 16 MiB browser limit exactly matches the complete-JSON limit used by the
current Wasm engine's default `EditorContext`. The separate 64 MiB session
retained-text limit measures aggregate logical history boundaries and does not
widen the serialized checkpoint ceiling.

Within its selected slot, the adapter rejects duplicate topology, extra or
missing own record members, accessors used in place of required data members,
wrong types or constants, noncanonical or exhausted generations, unsafe byte
counts, invalid digest spelling, UTF-8 length mismatch, and digest mismatch.
Inherited properties cannot satisfy required members. Records in other slots
are untouched. The adapter does not delete, repair, migrate on mismatch, or
overwrite corrupt evidence.

## Profile binding and startup preflight

The high-level browser owner resolves storage before reading a checkpoint:

- no semantic profile and no explicit scope preserves the exact legacy
  `"current"`/outer-V1/Checkpoint-V1 contract;
- `{ kind: "schemaFingerprint" }` uses the active schema fingerprint as the
  slot;
- `{ kind: "slot", name }` uses that exact caller-owned slot; and
- a semantic profile defaults to its schema-fingerprint slot even when no
  scope option is supplied.

The fingerprint default is profile-scoped, not document-scoped: documents and
lineages using the same schema share one slot, and a valid stored lineage wins
over `initialDocument`. Applications opening more than one same-schema document
must assign a distinct `{ kind: "slot", name }` to each persistence owner.

For a semantic profile, startup synchronously compiles and consumes the
bootstrap JSON before opening IndexedDB. That preflight returns only a deeply
frozen, handle-free compiled-profile descriptor and releases every generated
profile, descriptor, and generation handle. Storage is then bound to that
descriptor's fingerprint and Checkpoint V2 before `load()`. A record under the
selected key with a different binding returns
`session_checkpoint.binding_mismatch` before digest verification and without a
CAS token, fallback load, deletion, repair, or write.

After the asynchronous load, startup compiles the profile again to construct
the engine. The final schema name, version, fingerprint, and complete ordered
format kind/revision catalog must exactly match the preflight result before
rendering or autosave begins. The double compilation is intentional: generated
profile authority never survives across the async IndexedDB boundary. It is a
bounded startup-cost limitation, not a second durable identity.

An explicitly bound base `"current"`/base-fingerprint/Checkpoint-V1 owner can
read the legacy outer-V1 record. Its next successful compare-and-swap writes the
profile-bound outer-V2 form. No other implicit migration or slot fallback is
performed. Checkpoint V1 bindings accept only the built-in base fingerprint;
custom schema fingerprints require Checkpoint V2.

## Opening and schema attestation

Fresh creation is the only upgrade path accepted by this profile. During an
upgrade from `oldVersion === 0`, the adapter creates the exact store above. Any
other upgrade route is rejected. Once open, it verifies store count, name,
key-path mode, auto-increment mode, and index count before exposing storage.

Opening a database whose physical version is newer reports
`version_unsupported`; a version-1 database with the wrong topology reports
`schema_mismatch`. The adapter never deletes an incompatible database.

An open request's `blocked` event is progress, not proof of failure. A host can
observe it while the request remains pending. Every connection closes and
invalidates itself on `versionchange`; an abnormal database `close` event also
makes that connection terminal. Explicit close refuses new work while already
created transactions settle through their own terminal events.

## Load and compare-and-swap token

One `readonly` transaction enqueues `count(selectedSlot)` and
`get(selectedSlot)` and evaluates both from the same transaction snapshot. A
successful load is published only
after the transaction's `complete` event. It returns either validated record
data or observed absence plus an opaque token whose private binding contains
this store instance and either exact observed absence or the complete validated
record. The visible frozen empty object may be structurally cloned or
serialized, but the clone or decoded value carries no authority and exposes no
binding data. The token is not a lock. The token supplied to a successful save
becomes stale; the newly returned token binds the successor. A definitely
failed attempt does not itself consume the token, although another writer may
make it stale.

Outer record and binding validation, UTF-8 measurement, and SHA-256 verification
happen before the checkpoint text is handed to the already selected generated
engine factory. Rust then performs its own strict, bounded, canonical Session
Checkpoint V1 or V2 decode under that compiled schema. The mode is never inferred
from payload contents and a V2 failure is never retried as V1. A Rust rejection
is surfaced without installing a partial engine or changing the stored record.

## Atomic save

Encoding, UTF-8 admission, and SHA-256 computation finish before a write
transaction begins. One `readwrite` transaction first requests strict
durability and synchronously enqueues `count(selectedSlot)` and
`get(selectedSlot)`. A browser
that rejects only the durability-options overload with `TypeError` or
`NotSupportedError` is retried with the standard `readwrite` overload; other
transaction-creation failures are reported. In request callbacks,
while the transaction is active, the adapter:

1. checks one-record topology at that slot and validates the selected record;
2. compares exact selected-slot absence or the complete validated selected record,
   including generation, byte count, digest, and checkpoint JSON, with the
   token's private expected binding;
3. proves that the precomputed next nonzero `u64` generation is the exact
   successor of that matched record;
4. enqueues one `put()` of the complete replacement under the selected key; and
5. waits for the transaction's `complete` event.

There is no promise, timer, digest operation, or application callback between
the final compare and `put()`. Request success is not commit evidence, and a
call to `transaction.commit()` is not commit evidence. Only `complete` returns
the newly minted token. Abort retains the caller's old token and checkpoint.

IndexedDB serializes overlapping read/write transactions with the same store
scope. If two tabs load generation N and both try to replace it, at most one can
publish N+1; the other observes a compare-and-swap conflict. Breditor does not
silently rebase or overwrite that conflict.

Conflict, corruption, quota exhaustion, ordinary abort, connection loss,
generation exhaustion, unsupported version, and schema mismatch remain
distinct, payload-redacted failures. Conflict and quota failures are never
automatically retried.

`retry()` reuses the coordinator's current token; it does not refresh or rebase
it. A compare-and-swap conflict therefore requires a fresh load and an explicit
product-level keep, replace, or merge decision, followed by construction of a
new coordinator with the newly loaded token.

## Autosave coordinator

The command adapter exposes a bounded, handle-free core-commit feed. It emits
at the exact point where a validated Rust successor becomes the adapter's
authoritative observation, including a separate selection prestage, an
effective history boundary reported with an adopted atomic command result, and
a commit whose later DOM restoration requires reconciliation. A requested
history close whose command fails is discarded by Rust and emits nothing. The
autosave `commitObserver` is synchronous and stable. It only marks an epoch
dirty; checkpoint capture and IndexedDB work occur outside command delivery. Do
not also wire autosave as a command-queue observer, which would count ordinary
successful deliveries twice. While checkpoint capture is available, default
scheduling starts an attempt after a 250 ms trailing delay and no later than 2
s into one continuously changing dirty interval.

Core-commit observers are notification-only. They run while the adapter still
owns its non-reentrant execution lease, and the listener set is sampled at the
start of publication. Observers must defer reads and work; their synchronous
throws and asynchronous/thenable rejections are contained and cannot alter the
commit or prevent sibling notification.

There is at most one timer and one capture/save operation in flight. Further
commits during an in-flight save collapse into one later capture of the newest
state. A successful transaction installs its returned token before the next
dirty epoch is attempted. Failure pauses automatic work and retains the dirty
epoch; only explicit retry resumes it, preventing conflict, quota, or corrupt
storage from becoming a hot loop.

`observeStatus()` queues the current immutable status and later coalesced
transitions on microtasks. Up to 64 independent listeners may be registered;
releasing one is idempotent. Listener throws and rejected thenables are
contained. A paused failure retains the coordinator code and, when the port
provided one, its stable payload-free `causeCode` such as
`session_checkpoint.conflict` or `session_checkpoint.quota`. Product UI should
surface a paused state. It must not automatically retry conflicts or other
persistent failures from the notification callback.

`flush()` targets the dirty epoch visible to that call and settles only when
that epoch is committed or a relevant attempt fails. It does not convert an
unknown transaction into success. Disposal cancels future scheduling but does
not claim that an already dispatched IndexedDB transaction rolled back.
Scheduler methods are synchronous host boundaries. `now` and `schedule` must
not throw or return thenables, and `schedule` must not synchronously fire the
timer or synchronously call `markDirty()`, `flush()`, or `retry()`. `now()`
must return a finite, nonnegative number; a regression is clamped to the last
observed value. Violations pause with
`session_checkpoint_autosave.scheduler_failed`, and rejected thenables are
contained. `cancel` failures and returned thenables are contained after logical
timer invalidation. Before storage dispatch, reentry invalidates the active
attempt and timer. After a CAS save has been dispatched, the coordinator
preserves that attempt until settlement so it cannot lose a token for a
transaction that may have committed; success installs the returned token and
credits its target epoch before remaining dirty work pauses.

Checkpoint capture uses an adapter-bound read port. The port consumes the
generated Wasm string result internally and never exposes the raw engine. It
can capture canonical Rust state while the adapter is live or awaiting DOM
reconciliation, but returns temporary `undefined` backpressure during another
exclusive engine read/delivery or while native composition owns temporary DOM.
Uncommitted IME DOM is never serialized as editor state. Faulted/disposed
adapters and thrown checkpoint invocations return explicit failures, causing
autosave to pause instead of polling forever.

Composition or an exclusive adapter lease can keep capture temporarily
unavailable beyond the nominal 2 s scheduling bound. The coordinator retries
after a positive quiet delay rather than busy-polling; it does not claim a
wall-clock durability deadline while another owner legitimately holds capture.

Typical late-bound wiring, after load/restore and adapter construction, is:

```ts
const autosave = new BreditorSessionCheckpointAutosave(
  adapter.sessionCheckpointReadPort,
  checkpointStore,
  loaded.token,
);
const stopAutosaveObservation = adapter.observeCoreCommits(
  autosave.commitObserver,
);
const stopStatusObservation = autosave.observeStatus((status) => {
  renderSaveStatus(status);
});
```

Release `stopAutosaveObservation` and `stopStatusObservation`, dispose
autosave, dispose the adapter, close the store, and finally free the generated
engine when the editor is torn down. `bootstrapWasmEngine()` with a
`sessionCheckpoint` source transfers engine ownership to its successful caller;
the adapter borrows that engine and does not free it. A host may call `flush()`
before teardown, but must handle its explicit committed/failed/disposed result.

Continuous autosave is the durability mechanism. A host may request a best-
effort flush when a document becomes hidden, but unload/page-exit events are
not treated as reliable storage completion.

## Honest limits

- Each store owner addresses one local slot and one complete replacement.
  Several explicit slots can coexist, but there is no enumeration API,
  multi-document registry, append log, merge, collaboration, conflict
  resolution, rollback protection, or cross-device synchronization.
- Profile selection compiles the semantic bootstrap twice when IndexedDB is
  enabled: once before load for a handle-free durable binding, then again for
  the live engine. This favors authority/lifetime safety over minimum startup
  CPU and allocation cost.
- IndexedDB storage starts as best effort. A browser, user, or site-data policy
  can evict or clear it, and quota can reject a write. Persistent-storage
  permission is a separate host product decision.
- `durability: "strict"` is a hint, and browsers without that transaction
  overload use their default durability. A completed transaction is profile
  commit evidence, not an `fsync` promise or immunity from later storage loss.
- A crash can lose edits newer than the most recently completed save. The
  trailing and maximum delays bound intended scheduling, not operating-system
  survival.
- An IndexedDB open, digest, blocked upgrade, or storage transaction can remain
  pending indefinitely. The profile deliberately has no timeout: declaring an
  in-flight write failed while it can still commit would forfeit exact CAS-token
  ownership. `close()` cannot cancel an open request or transaction already
  issued to the platform.
- SHA-256 detects accidental mismatch only. This profile provides neither
  confidentiality nor protection from malicious same-origin code.
- A complete checkpoint includes undo and redo history. Text removed from the
  visible document can therefore remain recoverable in IndexedDB until the
  relevant history boundary is evicted or the slot is explicitly cleared.
  Visible deletion is not secure erasure, and products handling sensitive text
  need an explicit retention and site-data deletion policy.
- The storage adapter validates its closed outer record, byte count, and digest;
  it deliberately does not parse the inner Rust checkpoint. Strict inner decode
  happens only during engine restore.
- The commit feed reports validated successors adopted by the browser adapter.
  A generated mutator that throws or violates its result/projection/selection
  ABI before safe adoption creates fatal mutation uncertainty: the adapter and
  queue fail closed, checkpoint capture becomes terminally unavailable, and no
  observer may claim that unknown state was a validated commit.
- If a generated handle cleanup throws after a validated successor has been
  adopted, the commit feed reports that known commit and then the adapter faults.
  The dirty epoch is retained, but that adapter can no longer capture it; the
  host must recover from its last durable checkpoint or apply an explicit
  product-level recovery policy.
- Neither `retry()` nor this adapter repairs corrupt records or incompatible
  schemas. Those failures return no usable refreshed token; recovery requires
  an explicit host migration, database deletion/reset, or another product-level
  policy outside this profile.
- The `0.1.0` Playwright release gate, introduced at checkpoint `0.0.59`,
  exercises IndexedDB flush, reload restore, and persisted undo/redo through
  the public runtime in Chromium, Firefox, and WebKit. Deterministic and
  automated browser tests still cannot promise durability against eviction,
  crashes, indefinite transactions, or every platform storage policy. See
  [browser support and accessibility](BROWSER_SUPPORT_AND_ACCESSIBILITY.md).

## Standards basis

- [IndexedDB transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle)
- [IndexedDB transaction scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling)
- [IndexedDB durability hints](https://w3c.github.io/IndexedDB/#durability-hint)
- [IndexedDB opening and version changes](https://w3c.github.io/IndexedDB/#opening)
- [Storage Standard quotas and persistence](https://storage.spec.whatwg.org/)
- [Web Cryptography SHA-256 digest](https://www.w3.org/TR/webcrypto/)
- [Encoding Standard UTF-8 encoder](https://encoding.spec.whatwg.org/)
