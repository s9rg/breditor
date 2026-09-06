# Local-log storage-generation transaction

Status: value and strict ordinary-rotation validation implemented in Breditor
`0.0.32`; initial provisioning and the first IndexedDB profile frozen as a
`0.0.33` contract; pure-Rust root/selected normalization and selected-root-aware
next-rotation validation implemented in `0.0.34`; exact selected-envelope
retention/comparison implemented in `0.0.35`; exact non-owning attempt plans and
`Prepared`/`Uncertain` mechanics implemented in `0.0.36`; process-local exact
physical-attempt terminal attestations implemented in `0.0.37`; directional
resolution-value comparisons and the closed retired-transaction binding
implemented in `0.0.38`; process-local root resolution implemented in `0.0.39`
and rotation resolution implemented in `0.0.40`; canonical writer epoch, exact
non-authority mutation-fence comparison, and checked acquisition planning
implemented in `0.0.41`; process-local request-correlated writer-fence
acquisition and revocable-token issuance implemented in `0.0.42`;
pure token-and-tail-cursor single-frame append preparation implemented in
`0.0.43`; pure nonempty bounded speculative append FIFO implemented in
`0.0.44`; process-local uncertain FIFO-head attempt and one-shot exact request
implemented in `0.0.45`; attempt/request-correlated-as-appropriate append
terminal classification and explicit one-head acknowledgement implemented in
`0.0.46`; same-process append lost-callback resolution implemented in
`0.0.47`; storage I/O, process-restart reconstruction, and durable exclusive
ownership remain unimplemented

Validation format name: `breditor/local-log-storage-generation`

Implemented validation format version: `1`

Compatibility status: experimental repository-internal validation shape
outside the `0.1.x` browser compatibility promise

Version `0.0.32` implements the six bounded identity/version values, trusted
ordinary-rotation binding, private-constructor non-`Clone` manifest, strict
encode/decode codec, independent limits, and borrowed preparation validation
for this shape. It does not implement a prepared state, capability, receipt,
adapter, compare-and-swap, I/O, durability, restart selection, or ownership
release. The implemented V1 validation shape remains experimental and outside
the `0.1.x` compatibility promise. Implementations must not treat
successful validation as evidence that `breditor-core` can publish or commit
the record, select storage during restart, or recover and activate log bytes.

Version `0.0.34` adds two bounded incarnation-ID types, a strict
private-constructor root codec, trusted selected receipt/generation bindings,
root/rotation normalization into a private non-`Clone` selected value, and
next-rotation `prepare_rotation_from_selected`,
`encode_rotation_from_selected`, and `decode_rotation_from_selected` against
that selected summary. It still adds no adapter, I/O, authoritative head,
provisioning, attempt evidence,
writer authority, durability, or ownership release. Its O(1) property concerns
rotation-history length only; bounded current/predecessor/checkpoint bytes and
both strictly decoded checkpoints' document/session content still determine
work and memory.

Version `0.0.35` retains the complete checked selected binding and byte-exact
canonical current/optional-immediate-predecessor selections inside the
non-`Clone` selected root. Public inspection exposes borrowed receipt bindings
and byte lengths, not direct access to the retained raw selection JSON. A
separate public action compares caller-supplied exact envelope bytes. Its typed
errors and the selected root's `Debug` are payload-redacted. Exact equality is
still neither storage currentness nor authority; selection receipt bindings
remain caller-supplied validation facts, not commit evidence.

Version `0.0.36` closes checked root and rotation candidates into immutable
private plans. Every plan retains a complete prospective candidate selected
binding and exact canonical candidate JSON. A root additionally binds explicit
database and planned scope incarnations. A rotation snapshots the complete
prior selected binding and `Arc`-shares exact selected current/optional-
predecessor JSON, but retains neither the selected root nor either checkpoint
anchor. Private-constructor non-`Clone` `Prepared` and `Uncertain` values add a
core-issued ABA-safe process-local attempt identity, one borrowed request view,
cross-plan/stale-ID rejection, and allocation-preserving exact resubmission.
They add no I/O, authority, currentness, terminal evidence, durability, or
owner release.

Version `0.0.37` consumes one exact-ID host terminal attestation through
`observe_terminal_attestation`. `PublicationCompleted` means the host attests
that the exact publication-armed transaction passed all checks, enqueued the
complete exact mutation set, and emitted `complete`; a bare `complete` event or
completion of a validation, cleanup, resolver, or no-write transaction is
insufficient. Publication-completed and transaction-aborted attestations require
the exact opaque request ID cloned from the one emitted request; not-attempted
instead names the attempt ID. The negative branches close one physical
invocation only and retain the exact plan for exact resubmission. Rejected
attestations return the unchanged owner and unapplied attestation. This is still
process-local host evidence, not browser-event verification, serialized storage
resolution, authority, durability, or owner release.

The contract is deliberately platform-neutral. It defines the facts that a
native-filesystem or IndexedDB profile must associate and the evidence states
that later gates must enforce; v0.0.37 implements exact plan preparation,
conservative uncertainty, and host-attested terminal classification for one
physical invocation. It does not pretend that those two profiles have the same
durability primitive.

## Purpose and authority

One storage-generation transaction moves one local-log storage scope from an
old authoritative manifest to one new authoritative manifest. The new manifest
keeps these facts together:

- exact canonical Local Log Checkpoint V1 JSON;
- the old generation's accepted-prefix byte count and Frame V1 policy;
- the distinct successor generation and its Frame V1 policy, selected before
  the first successor append;
- the transaction, old-head, new-head, storage-profile, scope, and non-secret
  fence identifiers used by the adapter; and
- the session, sealed-generation, and successor-generation identities derived
  from the compacted runtime proof and cross-checked against the checkpoint.

The actors have separate authority even when one host component implements
several roles:

1. `breditor-core` owns semantic proof, cursor compaction, deterministic Local
   Log Checkpoint V1 encoding, exact in-memory ownership, and the strict
   storage-generation value/validation boundary. The implemented append FIFO
   and uncertain-head attempt own speculative preparation order, distinguished-
   head request egress/correlation, and logical enqueue while uncertain. The
   terminal/acknowledgement boundary correlates trusted callbacks and advances
   exactly one head into pending or drained ownership. The separate
   lost-callback resolver preserves queue/source ownership, correlates one
   stable read snapshot, and can yield exact retry or a separate one-head
   acknowledgement boundary; a transition from the drained append owner into
   rotation remains later work. These Rust transitions perform no storage I/O.
2. The host coordinator chooses the storage scope, lifetime-unique transaction
   and head identifiers, storage profile, successor Frame V1 policy, and the
   point at which an unobserved old-generation suffix is abandoned. It owns
   asynchronous scheduling, batching choice, backpressure, cancellation, and
   rate limiting, but may dispatch only the head and may not coalesce or reorder
   queue items. Dropping the owner is volatile loss, not cancellation or
   acknowledgement.
3. A profile-specific writer authority supplies unpersisted publication
   capability and its validation rules. The manifest's non-secret `fenceId`
   is the candidate generation's immutable activation correlation identity,
   not necessarily the identity of the capability authorizing the rotation.
   The IndexedDB V1 profile, for example, checks the currently selected
   generation's revocable writer token while publishing a fresh candidate
   activation fence. No capability is persisted in this manifest.
4. A platform adapter implements one named profile's compare-and-swap,
   atomicity, visibility, and durability rules and produces host-attested
   attempt classifications.
5. Restart recovery reads the profile's authoritative per-scope manifest/head.
   That record selects recoverable bytes, not a writable owner. Before one
   restarter can construct a writable successor, it must acquire a fresh
   exclusive writer capability and recheck the same exact head and manifest
   under the profile. Volatile Rust typestate, old capabilities, receipts, and
   the persisted `fenceId` are not restart authority.

The `0.0.32` core validates exact values and ordinary-rotation associations but
does not yet preserve transaction ownership. It cannot prove that a supplied
binding or prior manifest is authoritative, that a host-issued capability is
current, that a writer was fenced, or that a platform operation became durable.
A future host-attested receipt remains a trusted external assertion.

Version `0.0.33` freezes the first concrete browser realization in
[`INDEXEDDB_STORAGE_PROFILE.md`](INDEXEDDB_STORAGE_PROFILE.md). That profile
adds no executable adapter. It chooses a separate canonical root-selection
format, O(1) profile-attested current selection, database/scope incarnations,
transaction/head/generation identity tombstones, one fixed five-store
`readwrite` transaction, a mutable writer epoch separate from the immutable
activation fence, uncertain-outcome resolution, and payload cleanup.

Version `0.0.34` implements only the profile-independent Rust values used to
validate those immutable associations. Database and scope incarnations remain
caller-supplied syntax values rather than proof of establishment or freshness.
Root and selected values remain inspection state, and selected-root-aware
rotation validation proves only the supplied value/cross-link consistency. It
does not read or mutate IndexedDB, establish head currentness, validate a
mutable writer epoch, reserve an empty generation, or attest commit.

Version `0.0.35` closes a narrower identity gap in that value boundary. The
selected root keeps the full checked selected binding and exact current plus
optional predecessor canonical selection bytes so the v0.0.36 attempt plan can
reject byte-different records that share the same normalized scalar summary.
The raw retained selections remain core-private; public code can borrow the
receipt bindings, inspect byte lengths, and request exact comparison.

Version `0.0.36` builds the complete exact attempt plan before egress, enters
`Uncertain` under a fresh core-issued physical-attempt identity, and can expose
one borrowed payload request. Version `0.0.37` can consume one matching typed
host attestation and retain the plan in a positive or negative physical-attempt
state. Identity matching and event classification remain process-local. Version
`0.0.38` freezes directional resolution-value comparisons. Version `0.0.39`
implements process-local root resolution; version `0.0.40` implements the
nominally separate rotation resolution boundary.

## Authoritative manifest and head

Each `scopeId` has exactly one profile-defined authoritative head. Log files,
object-store entries, temporary records, or IndexedDB objects are not
authoritative merely because they exist or decode successfully.

The logical publication operation is:

```text
CAS(
  profileId/profileVersion,
  scopeId,
  expectedHeadId,
  committedHeadId,
  exact storage-generation manifest
)
```

The adapter may attempt publication only while holding the profile-defined
unpersisted authority for the currently selected head/generation, and it must
validate that authority inside the same publication operation. A successful
operation atomically changes the scope's authoritative head from
`expectedHeadId` to `committedHeadId`, makes the exact new manifest the record
selected by that head, and persists its `fenceId` as the successor generation's
immutable activation fact. The same profile operation must also establish the
successor as a lifetime-fresh empty generation reservation, or select a
lifetime-fresh absent generation that only profile-defined postcommit authority
can create lazily. No nonempty successor tail may become selected by this
publication.

This contract is rotation-only. Before an ordinary transaction, the scope has
one already validated prior manifest selected by `expectedHeadId`. Every public
`0.0.32` validation action requires that prior manifest, and the manifest has no
public seed constructor; the API cannot initiate a chain or provision its first
scope/head. Initial provisioning and profile migration require separate future
contracts and cannot be smuggled through this V1 rotation.

An ordinary rotation must preserve `profileId`, `profileVersion`, `scopeId`,
and `sessionId`; require the new `sealedLogId` to equal the prior manifest's
`successorLogId`; require the new `sealedFrame` to equal the prior manifest's
`successorFrame`; and require `expectedHeadId` to equal the prior manifest's
`committedHeadId`. The new `successorLogId` must be lifetime-fresh within the
scope and distinct from every earlier generation ID. The codec checks the
ordinary continuity visible in the supplied prior edge. A future adapter must
still prove authoritative selection and lifetime freshness beyond the IDs one
manifest can remember.

The identifiers are opaque. Head IDs have no numeric, lexical, timestamp, or
generation ordering. `expectedHeadId` names the exact prior authoritative head;
`committedHeadId` is a new lifetime-unique head ID and must differ from it. A
head ID must never be recycled within the lifetime of one scope. A transaction
ID is likewise lifetime-unique within one scope: retries reuse it only for the
same byte-exact plan, and it is never assigned to another plan.

If the current head already equals `committedHeadId` and the authoritative
record is exactly the planned record, an identical retry is already committed.
If the head ID matches but any record fact or byte differs, the result is a
collision, corruption, or host-contract violation. It is never an idempotent
success. If the current head is neither the expected nor committed head, the
plan is stale or conflicts with another publication.

No CRC or digest identifies the plan. The canonical outer UTF-8 JSON sequence,
including the exact decoded `checkpointJson` bytes, is the candidate record's
byte identity, but it is not the complete v0.0.36 attempt-plan identity. A root
plan also binds the database and planned scope incarnations through its full
candidate selected binding even though those facts are absent from Storage
Root V1 JSON. A rotation plan additionally binds the complete prior selected
binding and its exact current/optional-predecessor selection bytes. Equal root
candidate JSON under different incarnation facts therefore names different
plans.

Only output from the canonical encoder may be attempted or stored. Strict
decode must re-encode the complete outer value and require byte-for-byte
equality with its input; whitespace, member-order, numeric, or escaping
variants are not alternate encodings of one candidate record. A profile may
store those bytes as a string or blob or add integrity/authentication in an
envelope, but it must recover the exact canonical byte sequence.
Structured-object equality cannot replace exact candidate or selected bytes.

Version `0.0.32` deliberately pins `serde_json` `1.0.151` and carries a complete
golden V1 vector covering field order, integer spellings, quotes, slash,
backslash, control escapes, raw Unicode, and non-BMP Unicode. This prevents a
dependency update from silently changing plan identity. The pin is an explicit
experimental implementation choice, not a claim that serde's escaping behavior
is a permanent protocol; a future dependency change must either preserve the
golden bytes or introduce a separately reviewed canonical writer/version.

## Storage-generation V1 validation value (experimental)

The validation-only V1 value is a strict JSON object. Its compact canonical
UTF-8 encoding has no insignificant whitespace or trailing bytes and emits
fields in the exact order shown below. The example values and abbreviated
`checkpointJson` content are illustrative; the field order is not.

```json
{
  "format": "breditor/local-log-storage-generation",
  "formatVersion": 1,
  "profileId": "breditor/example-storage-profile",
  "profileVersion": 1,
  "scopeId": "scope:example",
  "transactionId": "transaction:example",
  "expectedHeadId": "head:old",
  "committedHeadId": "head:new",
  "fenceId": "fence:writer-epoch",
  "sessionId": "session:example",
  "sealedLogId": "log:generation-1",
  "successorLogId": "log:generation-2",
  "acceptedPrefixBytes": "1234",
  "sealedFrame": {
    "formatVersion": 1,
    "maxPayloadBytes": "16777216"
  },
  "successorFrame": {
    "formatVersion": 1,
    "maxPayloadBytes": "16777216"
  },
  "checkpointJson": "{\"format\":\"breditor/local-log-checkpoint\",...}"
}
```

The example profile is illustrative and is not reserved. Version `0.0.32`
strictly encodes and decodes this ordinary-rotation shape, but the format still
has no post-`0.1` compatibility promise.

### Field contracts

`format` and `formatVersion` route only this validation record. They do not alter
Local Log Checkpoint V1 or Local Log Frame V1.

`profileId` is a qualified name using Breditor's lowercase
`namespace/local-name` grammar and a maximum encoded length of 128 bytes.
`profileVersion` is a nonzero unsigned 32-bit integer. Together they identify
the adapter contract that owns head publication, finality, and recovery rules;
they are not the manifest's format version.

`scopeId`, `transactionId`, `expectedHeadId`, `committedHeadId`, and `fenceId`
use the portable local-log identity grammar
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. The 128-byte maximum is measured after JSON
string decoding. Scope and transaction identities are different semantic
types even when their text happens to match. Lifetime uniqueness and fence
freshness cannot be proved from one record and remain profile obligations.

`fenceId` is a bounded, non-secret correlation identity. It must not contain a
lease secret, file descriptor, browser transaction handle, authentication
token, or other authority. The adapter's actual capability stays outside the
record and outside debug output. Reconstructing or copying `fenceId` never
reconstructs authority. A profile must prevent fence-ID reuse from creating an
ABA window while an older attempt can still complete. A profile may bind its
publication capability to this identity, but that is not a platform-neutral
requirement; it must state the binding explicitly if it does.

`sessionId`, `sealedLogId`, and `successorLogId` use their existing local-log
identity types. Preparation derives them from the
`LocalLogTailCompactionOutcome` anchor, requires the sealed and successor IDs
to differ, and cross-checks all three against the exact nested Checkpoint V1
value. They are not accepted as independently drifting host configuration.

`acceptedPrefixBytes` is a canonical decimal-string `u64` copied exactly from
the compaction outcome. It is the exclusive generation-relative prefix already
admitted by the old cursor. It is not physical file length, proof of EOF,
proof that bytes came from a named store, or proof that later bytes do not
exist. Committing the manifest makes bytes at or after this boundary
semantically outside the sealed generation; physical ignore, quarantine, or
later truncation is profile policy.

`sealedFrame` records the old outcome's exact `LocalLogFrameLimits` together
with an explicit Local Log Frame version of `1`. `successorFrame` records a
host-selected Frame V1 policy for the new generation before any successor frame
is appended. Each `maxPayloadBytes` is a canonical decimal-string `u64`.
Neither value is a physical-size claim. A future frame format must receive an
explicitly versioned manifest contract and cannot reinterpret these V1 fields.

`checkpointJson` is one bounded JSON string whose decoded content is the exact
canonical output of `LocalLogCheckpointJsonCodec` for the compacted anchor and
the derived session/sealed/successor binding. It embeds Checkpoint V1 as text,
not as a nested outer JSON object. Whitespace, member-order, or escape variants
that decode to a semantically equivalent checkpoint are not the same plan: the
strict storage-generation decoder replays the nested checkpoint and requires
its canonical re-encoding to equal the decoded string byte for byte.

The storage record does not persist `LocalLogRecoveryLimits`,
`LocalLogCompactionLimits`, or `LocalLogCheckpointLimits`. Those remain explicit
runtime resource policies. In particular, strict Checkpoint V1 decode continues
to install its host-selected tombstone ceiling rather than trusting a value
from this manifest.

### Resource and shape requirements

`LocalLogStorageGenerationLimits` has independent finite limits for the
complete manifest input, canonical output, and decoded `checkpointJson`, plus
the nested `LocalLogCheckpointLimits`. The checkpoint string must also fit the
active checkpoint codec and `EditorContext` limits. Escaping the nested JSON
can make the outer record larger, so a checkpoint limit cannot stand in for a
whole-manifest limit.

The `0.0.32` defaults are exactly 33,558,528 complete input bytes,
33,558,528 canonical output bytes, and 16,777,216 decoded checkpoint bytes.
Hosts may replace each independently. These byte ceilings do not replace the
nested semantic checkpoint limits or prove that allocation will succeed.
During `prepare_rotation`, the nested checkpoint encoder must first produce its
bounded Checkpoint V1 string under `EditorContext` policy; the separate
storage-generation checkpoint ceiling is then an admission check, not a tighter
peak-allocation guarantee. Decode preflights the decoded checkpoint length
before owning that string. Serde may also allocate a bounded parser diagnostic
internally before this boundary projects it to payload-free public metadata;
the complete-input ceiling remains the outer bound on that work.

The V1 object and both frame-policy objects are exact: missing, unknown, or
duplicate fields fail closed. Fixed-width numbers reject negative, fractional,
floating-point, overflowing, or noncanonical representations. String limits
are checked before unbounded ownership or nested semantic work. The codec
routes the bounded outer format/version before nested Checkpoint V1 decode,
then reconstructs every bounded field, checks intrinsic topology, trusted
binding, prior-manifest continuity (including the sealed Frame V1 policy),
canonical checkpoint bytes, and canonical outer bytes before publishing an
inspection value. Decode validates the syntax and range of
`acceptedPrefixBytes` and `successorFrame`; it cannot prove their causal
provenance from storage. Preparation instead derives the accepted prefix and
sealed frame from the borrowed compaction outcome and takes the successor frame
from explicit caller input.

`LocalLogStorageGenerationJsonCodec` owns the separately trusted context,
binding, and limits. Its public `prepare_rotation` action borrows the compaction
outcome and caller inputs. It derives the nested checkpoint binding from the
outcome's anchor, requires the anchor context to equal the codec's separately
trusted `EditorContext`, and uses the codec's context and policy rather than
duplicated host strings. It returns a checked manifest without consuming,
quarantining, or releasing the anchor.

`decode_rotation` requires an independently trusted
`LocalLogStorageGenerationBinding` and an already validated prior manifest; it
then constructs the Checkpoint V1 binding from validated outer fields and uses
a separately trusted host `EditorContext` and resource policy. Equality between
outer and nested fields does not authenticate either value or prove causal
provenance.

No public diagnostic, `Debug`, or `Display` output may contain
`checkpointJson`, selection or manifest bytes, editor/session/history payloads,
an adapter capability, or opaque adapter evidence. Bounded profile, scope,
transaction, head, fence, session, and log identifiers may appear where needed
for typed diagnosis; therefore diagnostics are not a general secret-redaction
boundary. The `0.0.32` manifest has no public constructor, deliberately does
not implement `Clone`, and omits checkpoint content from `Debug`. The `0.0.35`
selected root likewise has no public constructor or `Clone`, reports only exact
selection byte lengths in `Debug`, and keeps raw retained selection access
core-private. Its public byte-validation errors identify only shape or
current/predecessor role. The v0.0.36 prepared/uncertain states, borrowed
request variants, opaque attempt ID, and preparation/transition errors likewise
have payload-redacted diagnostics. The v0.0.37 terminal attestation, terminal
outcome states, and recoverable terminal failure follow the same rule. Request
`Debug` reports bindings and byte lengths rather than candidate or selected
JSON; bounded identifiers may still appear and are not treated as secrets.

## Attempt mechanics and terminal evidence states

The v0.0.37 Rust boundary is non-owning with respect to checkpoint anchors,
semantic sessions, adapters, and writer authority. Its private exact plan and
public private-constructor attempt/evidence states are non-`Clone`; they carry
immutable plan data, volatile correlation, and typed host assertions only and
can never release a writable owner. `HostAttestedCommitted`, `NotAttempted`,
and `AttemptAborted` are Rust types. Version `0.0.39` implements the closed root-
resolution outcomes and version `0.0.40` implements the nominally separate
rotation-resolution outcomes, including nonretry
`DefinitelyNotCommittedConflict`. A general ownership-bearing
`DefinitelyNotCommitted` state remains unimplemented. The older borrowed
`prepare_rotation` and `prepare_rotation_from_selected` value-validation actions
are not `Prepared`.

### Prepared

`LocalLogStorageRootJsonCodec::prepare_root_attempt` takes one checked root
selection plus explicit database and planned scope incarnations.
`LocalLogStorageGenerationJsonCodec::prepare_rotation_attempt` takes one
normalized selected root and one checked candidate manifest and derives both
incarnations from the selected value. Each action canonical-encodes and
revalidates the candidate, constructs its complete prospective
`LocalLogStorageSelectedBinding`, and runs final strict selected normalization.
The temporary candidate selected root and reconstructed checkpoint anchor are
then dropped.

The private non-`Clone` plan retains the full candidate binding and exact
canonical candidate JSON. A rotation also copies the complete prior selected
binding and `Arc`-shares its exact current and optional predecessor JSON. It
does not retain the borrowed selected root, its anchor, a semantic owner, an
adapter, or writer authority. Failed preparation returns payload-free typed
errors and leaves borrowed inputs reusable. Re-preparing from those inputs can
create an equivalent plan, so non-`Clone` is API hygiene rather than exclusive
authority.

Success returns private-constructor non-`Clone`
`LocalLogStoragePreparedAttempt`. It exposes candidate receipt/binding facts
and individual/checked-total payload byte lengths but no raw payload. Prepared
cannot expose an adapter request. Consuming `begin_attempt` core-creates a fresh
opaque `LocalLogStorageAttemptId`, moves the unchanged plan to `Uncertain`, and
does so before any payload can cross the request boundary. The ID uses `Arc`
allocation identity: clones retain one identity, and a newly created ID remains
distinct while any old clone is observable, avoiding a process-local ABA
collision. It is not caller-chosen, serializable, ordered, hashed, durable,
authority-bearing, or terminal evidence.

### Prospective DefinitelyNotCommitted

`DefinitelyNotCommitted` means the profile has positively established that the
exact in-flight attempt did not become authoritative and cannot publish later
without a new explicit retry. It retains the same exact plan and its classified
evidence, but no checkpoint anchor, semantic owner, or publication authority.
It may retry the byte-identical transaction if separately supplied authority
remains valid, or a later API may reprepare after reauthorization.
Repreparation preserves the outcome-derived
session, sealed and successor generation IDs, checkpoint bytes, accepted
prefix, and sealed frame policy. It uses fresh transaction and committed-head
IDs, chooses a fresh candidate activation fence and profile authority when
required, and may explicitly reselect only the pre-append successor frame
policy. Changing generation or checkpoint facts requires a newly derived
compaction outcome. This state releases no owner.

A synchronous error, timeout, closed handle, visible old head, or absence of a
new record is not automatically this state. The named profile must define the
final abort, cancellation barrier, failed compare-and-swap, or other positive
evidence that makes later publication impossible.

### HostAttestedCommitted

In v0.0.37, `LocalLogStorageHostAttestedCommitted` means the host attests that
the exact transaction object associated with the retained emitted request ID was armed
on the publication branch with the complete exact plan and emitted its terminal
`complete` event after all checks and mutation requests were enqueued. A bare
`complete` callback is insufficient: a validation-only, cleanup, resolver,
idempotent no-write, or differently correlated transaction must not construct
`PublicationCompleted`. Rust verifies only process-local ID correlation and
legal typestate ordering; it cannot inspect or authenticate the host event.

The state is positive historical plan-commit evidence. It does not prove that
`committedHeadId` is still selected when the callback is handled, that storage
survived later reset or eviction, or that strict durability caused an
`fsync`-equivalent flush. It deliberately has no exact-resubmission transition.

Version `0.0.33` corrects an earlier overclaim: historical commit evidence alone
cannot release a long-lived exclusive semantic owner. A profile-specific
future transition may release a separately held owner exactly once only when it
also holds authority that cannot be revoked outside that owner's lifetime, or
when it defines transaction-coupled admission or explicit speculative-branch
semantics. The non-owning evidence state itself can never do so. Any later
release boundary must prevent a duplicate receipt or identical retry from
releasing a second exclusive owner. The IndexedDB V1 profile has no such
transition; its per-mutation epoch can be revoked before an event callback.

### Uncertain and physical terminal observations

Version `0.0.37` still enters `LocalLogStorageUncertainAttempt` before request
egress, so it conservatively cannot distinguish never dispatched from possibly
committed until a typed host attestation is consumed. The value retains the
complete exact plan, one current physical-attempt ID, and whether that attempt
already yielded its request. It owns no anchor, adapter, or writer capability
and cannot start a successor, establish currentness, or authorize cleanup.

`adapter_request(&mut self)` yields at most one borrowed non-`Clone`
`LocalLogStorageAttemptRequest` for the current physical attempt. A root request
exposes the attempt ID, full candidate binding, and exact canonical candidate
JSON. A rotation request also exposes the snapshotted prior selected binding
and exact selected current/optional-predecessor JSON. The borrow cannot outlive
its uncertain owner. This API guard reduces accidental duplicate egress, but a
host can copy the strings or dispatch them repeatedly; it is not proof of a
single external operation. The request also exposes a clonable opaque
`LocalLogStorageAttemptRequestId` generated at egress. Its allocation identity
binds the one emitted request to its attempt; it is volatile correlation, not a
capability, transaction handle, receipt, or durable identifier.

`require_current_attempt_id` rejects an opaque ID from another plan or an
earlier retry with `AttemptIdMismatch`. A match or mismatch classifies nothing.
Consuming `begin_exact_resubmission` preserves the same plan allocations and
byte-exact transaction, resets request eligibility, installs a fresh core-
issued attempt ID, and remains `Uncertain`. It accepts no replacement input:
the transaction ID, scope, expected/committed heads, candidate activation
fence, checkpoint bytes, prefix, frame policies, generation identities,
candidate binding/JSON, and selected rotation context are unchanged. An old
physical attempt can still complete after the fresh one begins. The ID and
state are process-local and cannot resolve a retry after restart.

`LocalLogStorageAttemptTerminalAttestation` is non-`Clone` and classifies one
current attempt as `PublicationCompleted`, `TransactionAborted`, or
`NotAttempted`. Publication-completed and transaction-aborted constructors take
the exact `LocalLogStorageAttemptRequestId` cloned from the emitted request;
safe callers therefore cannot construct either before egress. Not-attempted
takes the attempt ID and is accepted with or without prior request egress when
the named invocation created no publication-capable transaction. Consuming
`observe_terminal_attestation` checks the exact retained request/attempt
correlation. Success returns a
`LocalLogStorageAttemptTerminalOutcome` carrying
`LocalLogStorageHostAttestedCommitted`, `LocalLogStorageAttemptAborted`, or
`LocalLogStorageNotAttempted`.

An attempt/request correlation mismatch or impossible transaction terminal
observation returns
`LocalLogStorageAttemptTerminalFailure<T>`. That recoverable failure owns the
complete unchanged typestate value and unapplied attestation; callers can
inspect the payload-free error/code and recover either the owner or all parts.
Terminal-observation rejection uses `AttemptIdMismatch`, `RequestNotIssued`, or
`RequestIdMismatch`; `RequestAlreadyBorrowed` remains the separate one-shot
request-view error. No rejected observation silently consumes the exact plan.

`AttemptAborted` says only that one associated physical transaction rolled back.
`NotAttempted` says only that one named adapter invocation created no
publication transaction. Both retain the exact plan and attempt ID, remain
unresolved at plan level, and can consume `begin_exact_resubmission` to reuse
the same plan allocations and bytes under a fresh ID. One attempt ID names one
adapter invocation and at most one associated publication transaction. If
request bytes were copied or dispatched again, that operation is outside the
attempt correlation and may still commit. Each negative state has consumed the
invocation's one terminal observation and accepts no further terminal
attestation; future serialized storage resolution must classify any duplicate
or otherwise uncorrelated dispatch.

A future adapter must separately present profile-valid publication authority;
the plan/request and every v0.0.37 evidence state contain none. A profile may
replace revocable volatile authority only through its serialized
resolution/reacquisition rules, never by treating the persisted `fenceId` as
that authority.

After an uncertain attempt, observing that the authoritative head still equals
`expectedHeadId` is insufficient by itself. An earlier asynchronous, queued, or
partially completed operation might still publish later. The profile must first
prove that the transaction cannot subsequently commit—for example through its
own final plan-level cancellation/resolution barrier—before the state can
become `DefinitelyNotCommitted`. For IndexedDB V1, an `abort` event proves only
that one database transaction rolled back; another context may already have
retried the same plan, so the fixed overlapping resolver is still required.

### Resolution comparison prerequisites (v0.0.38)

Version `0.0.38` deliberately implements value-comparison prerequisites, not a
resolver. A later observation of the same selected binding must use the
directional `compare_later_observation` relation rather than `Eq`. The current
and predecessor receipts, active generation, and every immutable checkpoint
generation fact remain exact. Checkpoint state may only follow:

- `CheckpointOnly -> CheckpointOnly`;
- `Retired -> Retired | Reclaimed`; or
- `Reclaimed -> Reclaimed`.

The reverse `Reclaimed -> Retired` is a typed regression. This relation still
does not compare the exact current/predecessor JSON and does not attest that the
later binding came from storage. Mutable `writerEpoch` and
`currentWriterFenceId` are intentionally outside the binding and may change
while the same head remains selected. A selected active tail may also grow;
tail bytes are not immutable selection-envelope facts.

For a candidate-selected or superseded comparison, a formerly active
generation can be validated separately as the exact `retired` or `reclaimed`
checkpoint of one supplied superseding head. Log/session/frame, immutable
activation fence, activating head, and retiring head must all match. A rotation
with a plan-known older exact predecessor must additionally observe that record
as the matching retired tombstone; publication was required to retire it in the
same transaction, so missing, still-exact, or mismatched state makes a positive
commit classification unsound.

`LocalLogStorageRetiredTransactionBinding` models only facts present in the
Profile V1 tombstone: database/scope incarnations and scope ID, transaction ID,
expected/committed heads, selection kind, and `selectionByteLength`. It cannot
synthesize profile ID/version, session ID, or selection bytes that the record
does not retain. Matching length screens a collision but is never evidence that
caller-supplied bytes committed. Both implemented resolvers separately validate
the transaction key and exact `byCommittedHead` index mapping.

### Root resolver (`0.0.39`) and rotation resolver (`0.0.40`)

Version `0.0.39` implements process-local root resolution and version `0.0.40`
implements nominally separate rotation resolution. Each consumes a surviving
exact plan from uncertain, aborted, unattempted, or host-attested-committed
state; a plan-shape mismatch returns the unchanged source owner. Ordinary
findings come from one later profile-serialized transaction. One borrowed
shape-specific request mints one opaque resolver request identity at egress.
Restarting preserves the exact source plan but clears correlation, so the next
request ID is distinct and old evidence is stale. This is not process-restart
reconstruction.

Ordinary read evidence becomes applicable only after the exact fixed-scope
resolver transaction emits terminal `complete`; individual request success,
`commit()` return, resolver abort, callback loss, or unrelated completion
classifies nothing. Pre-egress or stale/cross-request evidence returns the
unchanged resolver and unapplied evidence. Root and rotation request tokens
and observation shapes remain nominally separate because their prepublication
authority shapes differ:

Physical database absence cannot create that fixed-scope transaction. Its
separate correlated `database_open_absent` assertion requires a versionless
open to report `oldVersion == 0`, synchronously abort the upgrade, and then
reach terminal open-request `error`. An existing database with a different meta
incarnation still uses transaction-completed evidence when that metadata is
otherwise valid. A schema-compatible database without `meta/profile` also uses
that path: it is reset/indeterminate only when all five stores were exhaustively
observed empty. Any record in any store without valid profile metadata is instead
`BrokenProfileAssociation::ProfileMetadata` and collision/corruption.

- The implemented root resolver validates the expected database incarnation,
  distinguishes an entirely absent planned scope plus absent candidate
  transaction/head and generation/chunk artifacts from an already provisioned
  scope, and validates the complete exact root selection/checkpoint/active-
  generation association when selected, its exact immediate-predecessor
  relationship when superseded, or its immutable identity, stored byte length,
  and case-specific direct-successor proof when retired. Selected, superseded,
  and retired cases also require the exact candidate committed-head index
  mapping. If the retired root's successor remains the exact current
  predecessor, strict selected normalization privately retains that
  predecessor's byte-derived sealed log ID and frame; both must equal the root
  plan's active generation, without a separate host-supplied scalar assertion.
  If the successor is already retired, its Profile V1 tombstone has discarded
  the JSON and sealed fields. That path therefore proves only the successor's
  retained transaction/head identity and head-index mapping plus the planned
  active generation's `retiredBy` linkage, not the discarded successor
  contents.
- The implemented rotation resolver validates both expected incarnations, the
  complete current scope graph and head index, the candidate transaction/index,
  candidate active-generation key, and branch-specific prior transaction and
  generation facts. Absence and conflict also require the complete candidate
  active-generation chunk prefix to be empty. Clean absence compares the full
  snapshotted prior selected binding under the directional cleanup relation plus
  exact current/optional-predecessor bytes, and requires the candidate
  transaction, committed-head index, candidate active-generation key, and
  complete candidate active-generation chunk prefix to be absent.

  Selected commit requires the candidate binding/JSON as current and the plan
  prior-current receipt/JSON as its exact predecessor; only the optional prior
  predecessor becomes an indexed tombstone. Superseded commit requires a valid
  later current with the exact candidate as immediate predecessor, candidate
  checkpoint retirement by the candidate head, candidate active retirement by
  the later head, the plan prior checkpoint under directional cleanup, and
  indexed plan prior-current plus optional prior-predecessor tombstones.

  Retired evidence requires the indexed candidate tombstone, both candidate
  generation retirement edges, the plan prior checkpoint under directional
  cleanup, indexed plan prior-current and optional prior-predecessor tombstones,
  and a direct successor with its exact head-index mapping. If that successor is
  the exact normalized current predecessor, its privately retained byte-derived
  sealed log ID/frame must equal the candidate active generation. If the
  successor is already retired, its tombstone cannot prove discarded JSON or
  sealed facts; it proves only retained transaction/head/index facts and the
  candidate active generation's `retiredByHeadId` linkage. Candidate length is
  collision screening, not candidate-byte evidence.

For either shape, an exact selected candidate may classify historical commit;
an exact candidate that is the valid immediate predecessor may classify
superseded commit; a matching retired identity cannot attest the old supplied
bytes; identity/byte collisions, broken associations, and resets fail closed.
Absence is shape-specific. A root with an absent planned scope and every
planned/artifact range empty may produce `RetryEligibleAtResolution` only from
an uncertain, aborted, or unattempted source. A rotation whose exact
prior selected envelope remains current and whose complete candidate namespace
is absent may also produce that outcome only for those three sources. It is
advisory after the resolver transaction finishes, never definite plan-level
noncommit, because copied request bytes can still be dispatched in another
later transaction. Another completely valid root scope is
`ScopeAlreadyProvisioned` only for the three non-host-committed sources; the
host-committed source instead yields reset or indeterminate. Rotation has no
`ScopeAlreadyProvisioned` result.

For a non-host-committed rotation source, complete candidate namespace absence
plus one exact direct competing rotation is
`DefinitelyNotCommittedConflict` and cannot exact-resubmit the immutable old
plan. The competing current must name the plan prior current receipt and exact
JSON as its immediate predecessor. Its checkpoint generation is the plan prior
active generation in the exact retired/reclaimed state under the competing
head, its current head index must match, the plan prior checkpoint follows
directional cleanup, and an optional older predecessor must be the matching
indexed tombstone. An arbitrary far-later current is outside the `0.0.40`
conflict observation and must fail closed. `HostAttestedCommitted` plus
candidate namespace absence in the intact expected scope is
`CollisionOrCorruption`, never retry or conflict. An exact candidate record
that is neither selected nor the immediate predecessor is also corruption.

A retry performed in a separate transaction must repeat every comparison and
authority check; an atomic compare-and-retry must keep the reads and writes in
the same transaction. For either shape, physical database absence, a different
valid metadata incarnation, an all-five-stores-empty compatible database without
`meta/profile`, or a missing/replaced planned scope lifetime is
`StorageResetOrIndeterminate`, not retry or already provisioned. Any record in
any store without valid profile metadata is `CollisionOrCorruption`. When the
expected database and planned scope lifetime still exist, a host-attested
source whose append-only candidate transaction or committed-head association is
missing is `CollisionOrCorruption`; a reported malformed association also fails
closed for every source. The three non-host-committed root sources may receive
advisory retry for complete planned-scope/artifact absence; a different valid
scope is `ScopeAlreadyProvisioned`. The equivalent rotation sources require the
exact prior envelope and complete candidate namespace absence for advisory
retry, or the exact direct competing rotation above for nonretry conflict.

### Mutation fencing, append preparation, and FIFO ownership (`0.0.41`–`0.0.46`)

Version `0.0.41` adds a pure value layer for the mutable writer facts that were
previously kept entirely outside Rust. `LocalLogStorageWriterEpoch` represents
the shortest unsigned ASCII decimal encoding of a nonzero `u64`; it rejects
empty, signed, whitespace-bearing, leading-zero, zero, nondecimal, and
overflowing text. Checked succession never wraps.

`LocalLogStorageMutationFenceBinding::from_selected` snapshots the complete
selected scalar binding, `Arc`-shares its byte-exact current and optional
predecessor JSON, and records one caller-supplied writer epoch and current writer
fence. It neither consumes nor exposes the selected root's private checkpoint
anchor. Its directional comparison applies
`LocalLogStorageSelectedBinding::compare_later_observation`, compares current
and optional predecessor bytes exactly, and then compares epoch and fence
exactly. The only accepted change is checkpoint cleanup from `Retired` to
`Reclaimed`; `Reclaimed -> Retired` and every immutable, byte, epoch, or fence
change reject. Structural equality remains stricter than this directional
relation.

Consuming `try_prepare_writer_fence_acquisition` derives exactly the successor
epoch and returns a checked non-`Clone`
`LocalLogStorageWriterFenceAcquisitionPlan` only when the proposed fence differs
from the current fence. Epoch exhaustion has precedence over equality. A typed
failure owns and returns the complete unchanged binding and proposed fence.
Advancing `u64::MAX - 1` to `u64::MAX` is valid; once maximum is current, no
further acquisition or root-changing rotation can advance it. Because append
does not itself increment the epoch, a future token already issued at maximum
could still be compared for append; “epoch exhausted” is not a proof that all
mutation authority vanished.

Neither the cloneable binding nor the non-`Clone` plan is a request, token,
lease, capability, CAS result, terminal receipt, or storage observation. The
constructor cannot prove that the selected envelope and writer facts came from
storage or one atomic transaction. Proposed-fence inequality does not prove
lifetime/global freshness. Public inspection and `Debug` expose byte lengths,
not retained raw JSON. There is no adapter, request correlation, terminal
evidence, browser-event provenance, restart reconstruction, owner release, or
append operation in `0.0.41`.

Version `0.0.42` consumes the checked plan into a nominally separate process-
local acquisition lifecycle. `begin_acquisition` creates a fresh opaque attempt
ID before egress. The first `adapter_request` permanently records egress, mints
a distinct opaque request ID, and yields one borrowed non-`Clone` view of the
complete expected binding, exact current/optional-predecessor JSON, expected
writer pair, and planned successor pair. State, request, terminal, failure, ID,
and token diagnostics redact the retained JSON.

The three terminal host-attestation kinds are `AcquisitionCompleted`,
`TransactionAborted`, and `NotAttempted`. Completion and abort require a clone
of the request ID minted at egress; not-attempted names the attempt and asserts
that the invocation created no transaction. Consuming observation checks
attempt identity first, request existence second, and exact request allocation
identity third. Rejection retains both unchanged owner and unapplied evidence.
Abort/not-attempted and direct uncertain resubmission preserve the exact plan
and payload allocations under a fresh attempt ID; an earlier uncertain
transaction can still complete.

Only matching completion issues a privately constructed, non-`Clone`,
nonserializable `LocalLogStorageMutationToken`. It retains the exact nominal
request identity and a post-acquisition binding whose selected envelope and
JSON allocations are unchanged while only epoch/fence become the checked
target pair. Its public inspection surface exposes binding and writer facts,
attempt/request identities, and JSON lengths, but not raw JSON.
The host attestation is historical, not proof that the token is still current
when returned. Another acquisition, rotation, reset, or conflicting mutation
may already have revoked it. Every protected storage mutation must re-read and
directionally compare the complete token binding in its own serialized
transaction.

For the concrete IndexedDB V1 profile, a future adapter must execute each
borrowed acquisition request in exactly one fixed five-store strict
`readwrite` transaction. It reads meta and scope control; the expected selected
transaction both by primary key and through the unique `byCommittedHead` index
at `[scopeId, scopeIncarnationId, committedHeadId]`; the optional predecessor;
and both selected generation records. It reconstructs the observed selected
envelope, permits only `Retired -> Reclaimed` checkpoint cleanup, compares both
JSON values byte-for-byte, and requires the expected writer epoch/fence. Only
then may it update the scope record by replacing exactly that writer pair with
the planned successor/proposal. The selected head and every transaction,
index, generation, and JSON fact remain unchanged. A mismatch aborts, and an
already-present target tuple is never idempotent success. Only this exact
transaction's terminal `complete` qualifies for acquisition completion.

The Rust lifecycle performs no I/O and cannot authenticate that callback.
Attempt/request IDs, epochs, and fences are non-secret process-local
correlation; one-shot borrowing cannot prevent copied or duplicate host
dispatch. No acquisition resolver or restart reconstruction exists. If the
valid `u64::MAX - 1 -> u64::MAX` acquisition commits but its terminal callback
or volatile state is lost, the stored tuple cannot attribute the commit, exact
retry encounters a writer mismatch, and no next epoch exists. Profile V1 has no
in-contract way to issue another token without later migration or reset. A
maximum-epoch token already issued before loss could still be checked by a
future adapter.

Version `0.0.43` adds a pure, storage-neutral preparation boundary for one
append. `LocalLogStorageMutationToken::try_prepare_append` consumes one token
and one `LocalLogTailCursor` while borrowing one `LocalLogEntry`. Validation
requires the token-selected session, checkpoint generation, active generation,
and active Frame V1 policy to agree with the cursor. It then deterministically
encodes exactly one complete frame and feeds those exact bytes through the
cursor's existing atomic semantic-admission transition. This preparation
performs no I/O and proves neither token currentness nor physical tail
provenance.

A typed `LocalLogStorageAppendPreparationFailure` owns the complete unchanged
token and cursor; the entry remains caller-owned. Success returns a private-
constructor non-`Clone` `LocalLogStorageAppendPlan` owning the token, exact
frame, checked generation-relative start and exclusive end, admission outcome,
and speculative advanced cursor. The start uses the canonical
`LocalLogStorageChunkStart` value: exactly twenty zero-padded ASCII decimal
digits over the full `u64` domain. The plan exposes no public raw-frame or
consuming-parts accessor. Its post-cursor remains quarantined and is not an
append acknowledgement, durable state, or writable owner.

The concrete IndexedDB V1 profile assigns exactly one complete Frame V1 with no
trailing bytes to each `chunks` value. The fourth compound-key component is
`chunkStart`, the frame's generation-relative byte start rather than an
ordinal. The first start is zero and every later start equals the prior start
plus the complete prior value length. Malformed keys, invalid/empty values,
multiple or truncated frames, trailing bytes, gaps, overlaps, and end overflow
are corruption.

A future executable append transaction must revalidate the complete token
binding and active-generation metadata, validate the complete physical chunk
prefix, and require the exact current last tail end to equal the plan start
before writing the plan's exact frame. The exact same complete bytes already at
the target, with no later record, may be idempotently present; different bytes
or an incompatible tail fail closed. A rotation transaction must validate that
same current last tail end against the candidate manifest's
`acceptedPrefixBytes`. The shared serialized comparison prevents append and
rotation from committing against different sealed-prefix assumptions.

The append plan deliberately has no adapter/request/terminal/acknowledgement,
uncertain resolver, retry classification, or restart representation. Cursor
byte provenance remains caller-trusted, and non-`Clone` is ownership hygiene
rather than linear enforcement. The one-frame-record layout adds per-record
overhead, and IndexedDB Profile V1 continues to serialize all scopes through
its common five-store transaction set.

Version `0.0.44` adds the pure nonempty `LocalLogStorageAppendQueue`. A queue
can begin only by consuming one checked append plan through `try_into_queue`.
Its immutable host-selected `LocalLogStorageAppendQueueLimits` independently
bound pending-frame count and exact retained encoded bytes; their defaults are
1,024 frames and 64 MiB. Either ceiling may be zero. Start checks frame count
before bytes, returns the complete unchanged plan on rejection, and otherwise
preserves its token, frame allocation, and speculative cursor as one
structurally distinguished head.

Consuming `try_enqueue` borrows another entry and checks pending-frame count
arithmetic and policy, deterministic Frame V1 encoding, platform frame-length
conversion, aggregate pending-byte arithmetic and policy, then semantic tail
admission. Success retains that same frame allocation at the FIFO back and
publishes one final cursor advanced through the entire pending prefix. Its
enqueue step owns the updated queue and reports the new frame's bounded range,
length, and admission outcome. The head cannot change. Every typed failure
returns the complete unchanged queue and leaves the borrowed entry caller-owned.

The queue exposes exact pending totals and remaining capacity, its full-prefix
speculative cursor/end, and only head start/end/length/admission metadata. Raw
frame bytes, followers, removal, acknowledgement, cursor release, and rotation
remain unavailable. The original mutation token is owned once at the queue
root; it can cover sequential frames because append does not alter its selected
or writer binding, but it can still be revoked before any physical transaction.
Each future head attempt must repeat the complete binding and tail comparison.

At the `0.0.44` checkpoint, a future uncertain-head typestate had to keep
accepting logical entries behind the in-flight head while blocking every
physical follower until that exact head was resolved. A future acknowledgement
transition alone could remove the head and produce a drained owner that releases
its final cursor; moving that drained owner into rotation was a separate edge.
Version `0.0.44` added none of that lifecycle, I/O,
terminal correlation, resolution, or restart state.

The frame and byte ceilings do not bound total queue heap: the speculative
cursor also retains session, history, replay indexes, decoded entries, and
allocation/container overhead. Enqueue fully encodes one candidate before
checking aggregate retained-byte capacity, so transient peak memory may exceed
that ceiling. Rust can drop the queue, but drop is neither a storage
cancellation nor an acknowledgement and loses the volatile speculative branch.
Allocation failure and stale-token rebase/extraction are not typed in this
release.

Version `0.0.45` adds the process-local append-head attempt boundary. Consuming
`LocalLogStorageAppendQueue::begin_head_append_attempt` moves the complete queue
into non-`Clone` `LocalLogStorageUncertainAppendAttempt` before any raw request
egress and assigns a fresh nominal `LocalLogStorageAppendAttemptId`. Its first
`adapter_request` call permanently records egress, mints a separate
`LocalLogStorageAppendRequestId`, and returns one borrowed, non-`Clone` request
for the structurally distinguished head only. One request ID names one adapter
invocation and at most one append-capable transaction. A second request from
the same attempt is rejected.

The request contains the complete expected mutation-fence and selected
bindings, exact canonical current and optional predecessor selection JSON,
expected writer epoch/current writer-fence ID, exact head start/end/length, and
the already encoded complete Frame V1 bytes. It exposes no follower or final
speculative cursor. Frame and selection payloads are sensitive and copyable,
so request/owner `Debug` omits them; the one-shot Rust borrow does not prove
single external dispatch.

An IndexedDB adapter invocation must use the fixed serialized five-store
transaction to re-observe all binding and byte-exact selection facts and scan
the complete physical tail. It may add exactly the head only when the valid
prefix ends at the requested start and that key is absent. It may recognize an
already final record only when its key and bytes are identical and the prefix
immediately before it ends at the same start. Different bytes, gaps, overlaps,
malformed records, later records, or binding mismatch fail closed. Returning
the Rust request, observing an individual IndexedDB request success, or
returning from `commit()` is not terminal evidence.

`begin_exact_resubmission` keeps the queue, token, exact head and follower
allocations, limits, counters, and final speculative cursor identical while
minting a fresh attempt ID and restoring one-shot request eligibility. It does
not refresh a stale token. The old request may still commit, so every attempt
must use the same serialized exact-tail and same-key/same-bytes idempotency
rule. Logical `try_enqueue` remains available before and after egress while
preserving the exact attempt and optional request IDs; success advances only
the private tail, and no core-issued request exposes or authorizes a follower.

Version `0.0.45` implements no terminal attestation, explicit head
acknowledgement, head pop, drained owner, cursor release, resolver, transition
from a drained owner into rotation, or restart reconstruction; those remained
the next implementation gate at that checkpoint.
Dropping this owner or losing the process cannot classify whether copied/
dispatched work committed and loses the volatile queue and correlation IDs. The
queue byte-limit exclusions, transient candidate-allocation peak, allocation-
failure gap, and stale-token limitation remain unchanged. With no separately
authenticated tail summary, exact Profile V1 validation may scan every active-
generation chunk, and the common five-store scope serializes otherwise
independent editor scopes.

Version `0.0.46` adds the process-local append terminal boundary. The current
`LocalLogStorageAppendTerminalAttestationKind` variants are
`TransactionCompleted`, `TransactionAborted`, and `NotAttempted`.
Completed/aborted evidence names the emitted request; not-attempted names the
attempt and is legal before or after egress. Consuming
`observe_terminal_attestation` checks attempt identity and, for request-bearing
evidence, request issuance then request identity, in that precedence.
`LocalLogStorageAppendTerminalFailure`
returns the unchanged uncertain owner and exact supplied attestation for
`AttemptIdMismatch`, `RequestNotIssued`, or `RequestIdMismatch`.

Callbacks are trusted profile attestations, not independently authenticated
browser or storage evidence. They carry no raw encoded-frame payload, and the
host cannot select a follower or choose what to pop. The current outcome
variants are
`HeadPresent(LocalLogStorageAppendHeadPresent)`,
`AttemptAborted(LocalLogStorageAppendAttemptAborted)`, or
`NotAttempted(LocalLogStorageAppendNotAttempted)`.

`TransactionCompleted` may yield `HeadPresent` only when the adapter attests
that the complete strict five-store transaction emitted terminal `complete`
after all binding, selected-record/index, generation, exact-selection, writer-
pair, Frame V1, and complete-tail checks. The final tail must be exact: either
the absent target was at the previous tail and that transaction added the
requested complete frame as the final record, or the same key and byte-identical
frame was already the exact final record with a valid prefix ending at its
start. Individual IndexedDB request success, calling `commit()`, partial writes,
different bytes, gaps, overlaps, malformed records, or any later record do not
qualify.

`HeadPresent` is not acknowledgement. The separate consuming
`LocalLogStorageAppendHeadPresent::acknowledge_head` transition advances exactly
one head. `LocalLogStorageAppendHeadAcknowledgementOutcome::Pending` owns
`LocalLogStorageAppendHeadAcknowledged`, promotes the allocation-identical first
follower, preserves order, token, limits, and final speculative cursor, and
decrements counters/bytes by exactly the acknowledged head. That promoted head
needs its own new attempt, request, and
matching completed attestation before another acknowledgement.
`Drained(LocalLogStorageAppendQueueDrained)` owns the token, final cursor,
limits, acknowledged request ID, and bounded acknowledged-head metadata; it is
the only successful append transition that releases that cursor.

The aborted and not-attempted owners advance nothing and preserve the complete
allocation-identical queue for `begin_exact_resubmission` under a fresh attempt
ID with restored one-shot request eligibility. A copied request can outlive a
negative attestation and still commit, so exact-
key/exact-bytes idempotency remains mandatory. The retained token may be stale,
and the supplied base cursor's physical-byte provenance remains caller-trusted.

Version `0.0.47` implements process-local lost-callback resolution over all
three queue-owning source states: `Uncertain`, `AttemptAborted`, and
`NotAttempted`. Moving into `LocalLogStorageAppendResolution` preserves the
exact source attempt ID, honestly optional source append-request ID, queue
allocations, token, counters, limits, and final speculative cursor. One
borrowed request mints one fresh opaque resolution ID only at egress. Restart
invalidates only that ID. Logical enqueue behind the immutable head remains
available after the live request borrow ends and preserves both source and
resolver correlation.

The resolution request exposes typed expected selected/writer facts, frame
limits, head start/end/length, and expected selection JSON lengths, but no
private expected frame or selection bytes. A current observation consumes a
normalized non-`Clone` selected root together with the writer pair and
committed-head-index transaction ID independently read in the same snapshot.
It does not accept a mutation binding directly, but callers can retain or
renormalize identical input bytes; its complete mutation binding remains
core-private, and only the host contract can establish fresh, independent I/O
and atomic co-observation.

Ordinary evidence is terminal only after one transaction scoped to exactly the
five Profile V1 stores, opened `readonly` without a durability option, emits
`complete` after every read and full cursor scan. IndexedDB scheduling places
that stable snapshot after earlier overlapping writers and before later
overlapping writers while allowing compatible readers to overlap. Physical
database absence instead uses the correlated aborted non-creating open path.

The core grants `RetryEligibleAtResolution` only for exact-tail absence with
the selected envelope, canonical current/optional-predecessor JSON, and writer
pair unchanged (apart from valid checkpoint reclamation). A byte-identical
exact final target grants `HeadPresentAtResolution`; a strictly later writer
epoch does not erase that historical fact, while regression or same-epoch
fence substitution is a collision. A selected-receipt change without a strict
writer-epoch advance is also a collision. Any later record prevents
acknowledgement, and target absence before a later key is a physical gap. A
valid different selection, reset, or otherwise insufficient observation
quarantines the queue.

Only the retry owner can begin a new exact append attempt. Only the positive
owner can enter the separate resolution acknowledgement family, which advances
the same private FIFO primitive by exactly one head into resolution-specific
pending or drained ownership. All other outcomes expose neither retry, pop,
cursor release, nor writer authority.

This resolver does not implement I/O, authenticate browser callbacks, cancel a
copied dispatch, refresh a stale token, or prove durable media state. It has no
process-restart representation, so dropping the volatile owner still loses the
queue and correlations. Its full scan is O(active-generation chunks), and its
fixed five-store scope can couple otherwise independent editor scopes.
IndexedDB `durability: "strict"` remains only a hint.

## Retry and idempotency rules

- One append plan names one exact frame at one exact generation-relative start;
  a queue retains it as the only dispatch-eligible head. The v0.0.45 borrowed
  request exposes that head, and an executable adapter transaction may classify
  byte-identical complete data at that target as
  idempotently present only after rechecking the full mutation-token binding,
  validating the complete tail, and proving that no later record exists. It
  never selects a follower, overwrites different bytes, or skips a gap.
- Append and rotation share one ordered tail barrier. Rotation cannot publish a
  manifest until its transaction proves that the current complete tail end
  equals `acceptedPrefixBytes`; a host scheduler cannot substitute enqueue
  order for that serialized storage check.
- One transaction ID names exactly one immutable plan for the lifetime of its
  scope. Changing even one byte or field requires a new transaction ID after
  the old attempt is terminally resolved.
- An uncertain attempt never retries under a new transaction ID, successor log
  ID, head ID, candidate activation fence, checkpoint string, prefix, or frame
  policy.
- Exact reapplication that finds `committedHeadId` plus the exact manifest is
  one idempotent success. It does not rerun semantic compaction or advance
  ownership twice.
- `committedHeadId` with a different record is a collision or corruption.
  `transactionId` with a different plan is likewise fatal; neither may be
  overwritten as a retry.
- A current head other than the expected or exact committed head is a stale or
  conflicting plan. Lexical or apparent temporal ordering cannot resolve it.
- Reacquiring expired/lost volatile publication authority follows the named
  profile's serialized resolution rules and does not silently change the
  immutable plan. Changing the candidate activation fence or any other plan
  fact requires positive proof that the old attempt cannot later publish,
  followed by fresh transaction and committed-head IDs. Copying `fenceId` is
  never authority renewal.
- A volatile receipt lost at process failure is not reconstructed from memory.
  Restart resolution uses the authoritative manifest/head and the profile's
  exact rules.

## Crash-state matrix

The recovery selector follows these cases; it never guesses from the longest
or newest-looking tail.

1. Before preparation, or after in-memory compaction/preparation but before any
   storage publication, the old authoritative head remains selected. Restart
   recovers the old generation through the prior durable state. The volatile
   compacted proof may be lost without changing storage.
2. Checkpoint, manifest, or an empty successor reservation staged before any
   publication attempt are unreachable artifacts only after a profile-defined
   terminal abort or cancellation barrier proves that no operation can later
   switch the head. Restart then selects the old head, and cleanup may remove
   those artifacts under the profile's rules. No successor Frame V1 append or
   semantic admission may occur before committed ownership release. If an
   operation may still publish, case 5 applies instead.
3. A profile-defined final compare-and-swap failure or plan-level terminal
   barrier yields `DefinitelyNotCommitted`; the old head remains authoritative.
   A concrete IndexedDB `abort` event is only v0.0.37 `AttemptAborted`, and a
   pre-transaction invocation failure is only `NotAttempted`; neither is that
   barrier.
4. Once the atomic head switch selects `committedHeadId`, the exact manifest,
   and the profile-established empty/absent successor reservation, restart
   selects those recoverable bytes after profile finality validation. This
   remains true if the response was lost before the runtime observed it. The
   record alone does not release a writable cursor: a restarter first acquires
   a fresh exclusive fence and rechecks the exact selection under that fence.
5. A crash or lost response spanning the possible commit point is `Uncertain`.
   Exact committed head plus exact record resolves new only with the profile's
   finality/fence attestation. Positive proof that the in-flight attempt is
   terminal and cannot later publish resolves old. Merely seeing the expected
   head does not.
6. When selected by the authoritative head, a missing, malformed, partially
   visible, mismatched, or same-head/different-record manifest does not
   authorize fallback to either generation. The scope remains uncertain or
   corrupt under the profile's recovery policy. Unselected partial staging is
   instead governed by cases 2 and 5.
7. A crash after commit but before the first successor append recovers a valid
   empty or profile-guaranteed absent successor at offset zero after the fresh
   fence/recheck step. Version `0.0.43` can prepare a speculative next frame and
   version `0.0.44` can retain a bounded FIFO behind it. Version `0.0.45` can
   expose the exact head under process-local uncertainty. Version `0.0.46` can
   consume qualifying transaction-complete evidence and acknowledge exact heads
   before releasing the final quarantined cursor. Version `0.0.47` can resolve
   a missing callback while the exact volatile owner survives, but neither
   version adds an executable adapter or process-restart reconstruction.
8. Old-generation truncation, deletion, or garbage collection begins only after
   exact commit resolution and any profile retention barrier. It is forbidden
   while prepared, in flight, physically aborted/not-attempted, retry-eligible,
   or uncertain.

An old writer that appends after the claimed fence is a storage-profile
violation. The manifest's accepted prefix prevents those bytes from silently
entering the sealed semantic generation, but the core cannot detect or repair
the broken physical authority.

## Required adapter profiles

The eventual native-filesystem and IndexedDB adapters must publish separate
profile documents and identifiers. Both implement the logical state machine,
but neither inherits guarantees from the other.

A native profile must state its lock or lease authority, compare-and-swap/head
mechanism, staging location, file and directory synchronization order, rename
and replacement assumptions, error-to-outcome classification, uncertain retry
behavior, and postcommit cleanup barrier. Rename alone is neither writer
fencing nor a universal durability proof. Platform and filesystem differences
must remain explicit.

The concrete `breditor/indexeddb-local-log@1` contract states the object stores
and keys participating in one authoritative transaction, when comparison and
publication occur, what `complete` and `abort` prove for one attempt, how
connection/page/process loss becomes uncertain, and how a later overlapping
transaction establishes plan-level resolution from the exact transaction and
selected record. It does not claim native `fsync`, rename, or directory
semantics. A request-level success is not commit evidence, and neither an abort
event nor reading an expected head bypasses the fixed overlapping-store
`readonly` resolver snapshot and its terminal-complete boundary.

Both profiles must keep the old authoritative generation recoverable until the
new exact record is committed, bound to the same plan and fence decision, and
safe from an older writer. Neither may publish `checkpointJson`, prefix/frame
metadata, and the head as independently drifting updates.

## Non-goals and forbidden inferences

This specification and the implemented values do not provide:

- actual storage bootstrap/provisioning, a general ownership-bearing
  `DefinitelyNotCommitted` state, ownership typestate, adapter, async API,
  or I/O implementation through `0.0.47`; the implemented publication-attempt
  terminal states, root/rotation resolution evidence, and writer-fence
  acquisition completion are trusted process-local host assertions. The
  v0.0.42 mutation token is revocable authority only under that contract, and
  the v0.0.43 append plan, v0.0.44 FIFO, and v0.0.45 uncertain head/request are
  speculative in-memory preparation/ownership/correlation. The v0.0.46 append
  terminal/acknowledgement states and v0.0.47 append resolver likewise consume
  trusted attestations; none is authenticated proof that its binding is
  presently current;
- filesystem, object-store, or IndexedDB durability by themselves;
- proof of EOF, physical old-tail length or cursor provenance, truncation,
  independently authenticated append completion, flush, `fsync`, atomic
  replacement, or crash recovery;
- authentication, authorization, cryptographic integrity, content addressing,
  rollback protection, causal provenance, or multi-writer consensus;
- proof that a transaction, head, fence, session, or generation identity is
  honest, globally unique, fresh, or secret;
- proof that a supplied binding, prior manifest, or normalized selected root is
  currently authoritative, that the physical successor is fresh and empty, or
  permission to release a writable successor owner;
- proof that one borrowed request was dispatched only once, that an attempt or
  request ID match is authenticated browser-event provenance, or that process-
  local attempt state and its exact plan survive restart;
- writer-fence acquisition resolution after callback loss, durable token
  reconstruction, or a Profile V1 liveness escape after an unattributed final-
  epoch commit;
- an append adapter, process-restart append reconstruction, durable exclusive
  writer release, a transition from the drained append owner into rotation, or
  multi-frame storage chunks;
- a change to Local Log Checkpoint V1 or Local Log Frame V1;
- durable encoding of recovery, compaction, or checkpoint resource policies;
- generation garbage collection, tail-wide replay, migration, host retry
  scheduling, backpressure, or cancellation APIs; the core owns logical
  preparation, request correlation, FIFO order, terminal classification, and
  exactly-one-head acknowledgement while the host chooses when to schedule
  those transitions; or
- a permanent compatibility promise for the experimental V1 shape.

`EndOfInput`, a valid CRC, successful JSON decode, object existence, file
length, modification time, lexical ID order, the longest tail, and the newest
timestamp are never commit or recovery authority. Only the named profile's
authoritative per-scope head and exact manifest record can select the new
generation.

## Implemented validation boundary and remaining work

Version `0.0.32` implements only the bounded identities, trusted binding,
private-constructor non-`Clone` manifest, independent limits, strict codec, and
borrowed preparation validation. The implementation separates
`prepare_rotation`, `encode_rotation`, and `decode_rotation` into distinct
action modules. Preparation cannot quarantine or release its borrowed outcome,
and a successful manifest remains inspection data rather than permission to
activate the successor. All public rotation actions require an already
validated prior manifest; there is deliberately no public initial seed.

Version `0.0.33` now freezes initial scope/head provisioning and the concrete
`breditor/indexeddb-local-log@1` profile. It names the exact object stores/keys
and committed-head index, comparison and publication transaction, terminal
commit and definite-noncommit evidence, lost-response/connection recovery,
checkpoint-only and empty-active reservations, restart resolution, exact
receipt-retirement window, mutable writer epoch, and cleanup barrier. This
remains a contract, not a claim that an IndexedDB adapter, Wasm binding,
atomic publication implementation, or durability guarantee exists.

Version `0.0.34` implements the pure bounded incarnation IDs,
private-constructor root codec, trusted selected receipt/generation bindings,
root/rotation normalization, and selected-root-aware next-rotation validation.
The selected root privately retains its decoded checkpoint anchor and exposes
inspection facts only. O(1) means independent of the number of older rotations,
not of current/predecessor/checkpoint bytes or document/session size. This is
still value validation: no adapter operation proves provisioning, current
head, global ID/fence freshness, empty generation, writer epoch/authority,
commit, durability, or owner release.

Version `0.0.35` retains the complete checked selected binding plus the exact
canonical current and optional immediate-predecessor selections. It exposes
borrowed receipt bindings, byte lengths, and public exact-envelope comparison,
while direct retained-byte access remains core-private and `Debug`/errors remain
payload-redacted. O(1) still means only independent of older rotation count:
up to two complete outer selections, their embedded checkpoints, the retained
current checkpoint text, and the decoded anchor make memory payload-sized.

Version `0.0.36` implements private non-`Clone` exact root/rotation plans and
private-constructor, anchor-free, non-authority `Prepared`/`Uncertain` states.
Candidate plans retain the full prospective binding and exact JSON; a rotation
also snapshots the full selected binding and `Arc`-shares exact selected current/optional-
predecessor JSON without retaining a selected root or anchor. Final strict
normalization reconstructs and then drops the candidate anchor. `begin_attempt`
core-issues an ABA-safe process-local ID before egress, `adapter_request` yields
one borrowed request view, stale/cross-plan IDs are rejected without
classification, and exact resubmission preserves the same plan allocations and
bytes under a fresh ID. A rotation plan can retain up to three payload
envelopes, so O(1) is history count rather than byte size. The one-shot request
cannot prevent copied bytes or duplicate external dispatch. These values do not
classify request success, `commit()` return, or an abort callback as plan-level
finality, release a checkpoint anchor, or claim stable currentness.

Version `0.0.37` adds `LocalLogStorageAttemptTerminalAttestation` and its stable
kind, consuming `observe_terminal_attestation`, recoverable rejection that
retains both owner and unapplied attestation, and the non-`Clone`
`HostAttestedCommitted`, `AttemptAborted`, and `NotAttempted` states. Positive
completion and abort require the exact opaque request ID emitted at request
egress; the request ID makes pre-egress transaction attestations unconstructible
through the safe API. Positive completion remains a host assertion about the
exact publication-armed transaction; abort/not-attempted are physical-only
observations. The two negative states preserve allocation-identical exact
resubmission under a fresh attempt ID after consuming the prior invocation's one
terminal observation. None of these states provides storage currentness,
adapter authority, durability, owner release, or restart reconstruction.

Version `0.0.38` adds the directional same-selection comparison, exact
active-to-retired/reclaimed validation under a superseding head, closed
retired-transaction facts, stable change/error categories, and adversarial
transition tests. These are inspection-value checks only and create no resolver
evidence.

Version `0.0.39` implements the root-resolver request, terminal evidence,
ownership-preserving failure, source-aware outcome, and advisory exact-retry
mechanics. Version `0.0.40` implements the nominally separate rotation resolver,
including branch-specific selected/superseded/retired graphs, exact direct-
competitor conflict evidence, and source-aware host-committed corruption
precedence.
Shape-valid absence is advisory `RetryEligibleAtResolution` only for a non-host-
committed root source after complete planned-scope/artifact absence, or for an
equivalent rotation source while the exact prepublication envelope remains
current and the complete candidate namespace is absent. It is not the blanket
result for another valid scope or conflicting rotation head. Arbitrary far-
later conflict classification remains a later extension. IndexedDB Profile V1
still cannot release a long-lived exclusive Rust owner: every mutation fence is
revocable between transactions. Consuming ownership requires a separately held
lock,
transaction-coupled semantic admission, or an explicitly revocable/speculative
branch. The provisioning contract must not treat a checked root, exact envelope
match, host attestation, or in-memory compaction as storage authority.

Version `0.0.41` freezes the mutable writer epoch/fence as an exact non-authority
comparison binding and checked acquisition plan. The binding retains the full
selected binding and `Arc`-shared exact current/optional-predecessor JSON plus
the writer pair. Directional comparison accepts only `Retired -> Reclaimed`
checkpoint cleanup; the consuming plan action derives one exact successor epoch
and rejects a proposed fence equal to the current fence while returning both
inputs on failure. It adds no raw-JSON public surface, provenance, atomic co-
observation, CAS, request, terminal evidence, token, authority, global fence
freshness, browser adapter, restart reconstruction, owner release, or append.

Version `0.0.42` implements that process-local request-correlated acquisition
boundary. One exact plan becomes an uncertain attempt before egress; one
borrowed request mints nominal attempt/request correlation and carries the
complete selected envelope plus expected and target writer pairs. Matching
terminal completion creates a non-`Clone` revocable mutation token; abort and
not-attempted preserve the exact plan for fresh-identity resubmission, and
transition rejection preserves both owner and evidence. Every storage mutation
must still recheck the token's complete binding inside its own transaction.

Version `0.0.43` implements only the pure token-and-tail-cursor append plan.
`try_prepare_append` consumes both owners, borrows one entry, validates exact
session/checkpoint/active-generation/Frame V1 agreement, encodes and
semantically admits one exact frame, and either returns both owners unchanged
on typed failure or quarantines the token, frame, and speculative post-cursor in
a non-`Clone` plan. `LocalLogStorageChunkStart` freezes the canonical twenty-
digit generation-relative offset key. The IndexedDB profile fixes one complete
Frame V1 with no trailing bytes per chunk and requires future append and
rotation transactions to compare the same exact current tail end.

Version `0.0.44` implements the pure nonempty bounded append FIFO. One checked
plan becomes its immutable head under independent frame-count and aggregate-
byte limits. Further borrowed entries are encoded, resource-checked, and
semantically admitted at the final speculative tail before their exact frame
allocations join the back. Every failure returns the complete unchanged plan or
queue. The queue owns one token, one full-prefix speculative cursor, exact
totals, and ordered private items; public inspection cannot select a follower
or obtain any frame bytes. It implements no request, physical attempt, terminal
observation, acknowledgement, head removal, drained state, or rotation edge.

Version `0.0.45` consumes that queue into conservative uncertainty before head
egress. One fresh append-attempt ID is eligible for at most one invocation; the
first `adapter_request` call permanently records egress, creates a separate
request ID, and lends one non-`Clone` exact head request. It includes the complete
mutation-fence/selection binding, exact current/optional-predecessor selection
JSON, expected writer pair, and exact head key/range/Frame V1 bytes while
redacting payloads from `Debug`. One request ID names one invocation and at
most one append-capable transaction; copied payloads can still be dispatched
outside that correlation.

Every adapter transaction must recheck all binding and byte-exact selection
facts and the complete serialized tail, accepting only an absent target at the
exact end or the same key and byte-identical final frame. Request return,
individual `IndexedDB` request success, and `commit()` return are not terminal
evidence. Exact resubmission preserves every queue allocation and byte under a
fresh attempt ID without refreshing a stale token; the earlier request may
still commit, so same-key/same-bytes idempotency is mandatory. Logical enqueue
may continue on the uncertain owner while preserving its IDs, but no core-issued
request exposes or authorizes a follower.

Version `0.0.46` consumes one matching append terminal attestation as a trusted
profile callback. The current kinds are `TransactionCompleted`,
`TransactionAborted`, and `NotAttempted`; fixed error precedence is attempt-ID
mismatch, then, for request-bearing evidence, request not issued and request-ID
mismatch, with unchanged owner and attestation returned on failure. Completed
evidence yields a separate `HeadPresent` only after strict five-store terminal
completion and exact added-tail or byte-identical exact-final-tail qualification.
Negative owners remove nothing and retain the allocation-identical queue for
exact resubmission under a fresh attempt ID and restored request eligibility.

`LocalLogStorageAppendHeadPresent::acknowledge_head` is the distinct consuming
step that advances exactly one head. A pending outcome promotes the exact first
follower, retains order/token/limits/final cursor, and decrements frame/byte
accounting by exactly the acknowledged head. A drained outcome owns the token,
final cursor, limits, and acknowledged request/head metadata. No second head can
advance without a new attempt, request, matching completed attestation, and
explicit acknowledgement.

This is not an executable adapter. Writer-fence acquisition must perform the
primary-key plus unique current-head-index read, complete selection/generation/
writer comparison, and scope-control-only writer-pair update in its fixed
strict five-store transaction. A head-append transaction must repeat the same
authoritative reads and writer-pair comparison, then either add only the exact
chunk or complete the exact-final-tail idempotent branch without a write; it
must not update the writer pair. The core cannot authenticate callbacks,
prevent copied dispatch, reconstruct IDs or tokens after process restart, or
recover acquisition liveness after an unattributed commit at `u64::MAX`.
Version `0.0.47` can classify a missing append callback only while its exact
process-local owner survives; restart reconstruction and a transition from the
drained append owner into rotation remain later work. A
copied request may outlive a negative attestation, the retained token may be
stale, the base cursor remains caller-trusted, and `durability: "strict"` is only
an IndexedDB hint. The host owns scheduling and backpressure without owning
order.
