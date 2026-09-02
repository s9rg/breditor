# Local-log storage-generation transaction

Status: value and strict ordinary-rotation validation implemented in Breditor
`0.0.32`; initial provisioning and the first IndexedDB profile frozen as a
`0.0.33` contract; pure-Rust root/selected normalization and selected-root-aware
next-rotation validation implemented in `0.0.34`; exact selected-envelope
retention/comparison implemented in `0.0.35`; exact non-owning attempt plans and
`Prepared`/`Uncertain` mechanics implemented in `0.0.36`; storage I/O,
terminal/resolver evidence, and ownership release remain unimplemented

Validation format name: `breditor/local-log-storage-generation`

Implemented validation format version: `1`

Compatibility status: unstable pre-`0.1` validation shape; no permanent promise

Version `0.0.32` implements the six bounded identity/version values, trusted
ordinary-rotation binding, private-constructor non-`Clone` manifest, strict
encode/decode codec, independent limits, and borrowed preparation validation
for this shape. It does not implement a prepared state, capability, receipt,
adapter, compare-and-swap, I/O, durability, restart selection, or ownership
release. The implemented V1 validation shape remains a pre-`0.1` contract,
not a permanent compatibility promise. Implementations must not treat
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

The contract is deliberately platform-neutral. It defines the facts that a
native-filesystem or IndexedDB profile must associate and the evidence states
that later gates must enforce; v0.0.36 implements only exact plan preparation
and conservative uncertainty. It does not pretend that those two profiles have
the same durability primitive.

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
   storage-generation value/validation boundary. It performs no storage I/O.
2. The host coordinator chooses the storage scope, lifetime-unique transaction
   and head identifiers, storage profile, successor Frame V1 policy, and the
   point at which an unobserved old-generation suffix is abandoned.
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

Version `0.0.36` adds no host attestation. It builds the complete exact attempt
plan before egress, enters `Uncertain` under a fresh core-issued physical-
attempt identity, and can expose one borrowed payload request. Identity
matching is process-local correlation only. Terminal events and serialized
resolution remain the v0.0.37 boundary.

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
pre-`0.1` implementation choice, not a claim that serde's escaping behavior is
the permanent protocol; a future dependency change must either preserve the
golden bytes or introduce a separately reviewed canonical writer/version.

## Storage-generation V1 validation value (pre-0.1)

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
have payload-redacted diagnostics. Request `Debug` reports bindings and byte
lengths rather than candidate or selected JSON; bounded identifiers may still
appear and are not treated as secrets.

## Attempt mechanics and future evidence states

The v0.0.36 Rust boundary is non-owning with respect to checkpoint anchors,
semantic sessions, adapters, and writer authority. Its private exact plan and
public private-constructor `Prepared`/`Uncertain` states are non-`Clone`; they
carry immutable plan data and volatile correlation only and can never release a
writable owner. `DefinitelyNotCommitted`, `HostAttestedCommitted`,
`NotAttempted`, `AttemptAborted`, and resolver outcomes remain specification
states for v0.0.37, not v0.0.36 Rust types. The older borrowed
`prepare_rotation` and `prepare_rotation_from_selected` value-validation
actions are not `Prepared`.

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

### DefinitelyNotCommitted

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

`HostAttestedCommitted` means the adapter attests that the authoritative head
equals `committedHeadId`, that the selected record is the exact planned record,
and that the profile's commit/fence conditions completed. This state is a host
assertion, not an independent proof by `breditor-core`.

Version `0.0.33` corrects an earlier overclaim: historical commit evidence alone
cannot release a long-lived exclusive semantic owner. A profile-specific
future transition may release a separately held owner exactly once only when it
also holds authority that cannot be revoked outside that owner's lifetime, or
when it defines transaction-coupled admission or explicit speculative-branch
semantics. The non-owning evidence state itself can never do so. Any later
release boundary must prevent a duplicate receipt or identical retry from
releasing a second exclusive owner. The IndexedDB V1 profile has no such
transition; its per-mutation epoch can be revoked before an event callback.

### Uncertain

Version `0.0.36` enters `LocalLogStorageUncertainAttempt` before request egress,
so it conservatively cannot distinguish never dispatched from possibly
committed. The value retains the complete exact plan, one current physical-
attempt ID, and whether that attempt already yielded its request. It owns no
anchor, adapter, writer capability, or terminal evidence and cannot start a
successor, classify commit/noncommit, or authorize cleanup.

`adapter_request(&mut self)` yields at most one borrowed non-`Clone`
`LocalLogStorageAttemptRequest` for the current physical attempt. A root request
exposes the attempt ID, full candidate binding, and exact canonical candidate
JSON. A rotation request also exposes the snapshotted prior selected binding
and exact selected current/optional-predecessor JSON. The borrow cannot outlive
its uncertain owner. This API guard reduces accidental duplicate egress, but a
host can copy the strings or dispatch them repeatedly; it is not proof of a
single external operation.

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

A future adapter must separately present profile-valid publication authority;
the v0.0.36 plan/request contains none. A profile may
replace revocable volatile authority only through its serialized
resolution/reacquisition rules, never by treating the persisted `fenceId` as
that authority. Version `0.0.37` may resolve to
`HostAttestedCommitted` only after an exact authoritative match plus the
profile's finality and fence attestation, or to
`DefinitelyNotCommitted` only after profile-defined positive noncommit proof.
Otherwise it remains uncertain.

After an uncertain attempt, observing that the authoritative head still equals
`expectedHeadId` is insufficient by itself. An earlier asynchronous, queued, or
partially completed operation might still publish later. The profile must first
prove that the transaction cannot subsequently commit—for example through its
own final plan-level cancellation/resolution barrier—before the state can
become `DefinitelyNotCommitted`. For IndexedDB V1, an `abort` event proves only
that one database transaction rolled back; another context may already have
retried the same plan, so the fixed overlapping resolver is still required.

## Retry and idempotency rules

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
   A concrete IndexedDB `abort` event is only `AttemptAborted`, not that
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
   fence/recheck step. Later complete successor frames are handled by the
   existing Frame V1 and tail-cursor contracts.
8. Old-generation truncation, deletion, or garbage collection begins only after
   exact commit resolution and any profile retention barrier. It is forbidden
   while prepared, in flight, definitely-not-committed but retryable, or
   uncertain.

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
event nor reading an expected head bypasses the fixed serialized resolver.

Both profiles must keep the old authoritative generation recoverable until the
new exact record is committed, bound to the same plan and fence decision, and
safe from an older writer. Neither may publish `checkpointJson`, prefix/frame
metadata, and the head as independently drifting updates.

## Non-goals and forbidden inferences

This specification and the implemented validation values do not provide:

- actual storage bootstrap/provisioning, terminal commit/noncommit or resolver
  evidence, ownership typestate, adapter, async API, writer capability, or I/O
  implementation in `0.0.36`; the implemented plan and attempt ID provide only
  exact payload/correlation mechanics, selected receipt bindings are caller-
  supplied validation inputs, and the checked root value is only a proposal;
- filesystem, object-store, or IndexedDB durability by themselves;
- proof of EOF, physical old-tail length, truncation, append completion, flush,
  `fsync`, acknowledgement, atomic replacement, or crash recovery;
- authentication, authorization, cryptographic integrity, content addressing,
  rollback protection, causal provenance, or multi-writer consensus;
- proof that a transaction, head, fence, session, or generation identity is
  honest, globally unique, fresh, or secret;
- proof that a supplied binding, prior manifest, or normalized selected root is
  currently authoritative, that the physical successor is fresh and empty, or
  permission to release a writable successor owner;
- proof that one borrowed request was dispatched only once, that an ID match is
  a storage observation, or that process-local attempt state survives restart;
- a change to Local Log Checkpoint V1 or Local Log Frame V1;
- durable encoding of recovery, compaction, or checkpoint resource policies;
- generation garbage collection, tail-wide replay, migration, retry scheduling,
  backpressure, cancellation APIs, or queue ordering; or
- a permanent compatibility promise for the implemented pre-`0.1` V1 shape.

`EndOfInput`, a valid CRC, successful JSON decode, object existence, file
length, modification time, lexical ID order, the longest tail, and the newest
timestamp are never commit or recovery authority. Only the named profile's
authoritative per-scope head and exact manifest record can select the new
generation.

## Implemented validation boundary and next gate

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

Version `0.0.37` is the next gate and should add the terminal and serialized-
resolver evidence classifications: matching transaction completion as host-
attested historical
commit, exact selected/superseded resolution, same-incarnation absence as
definite noncommit, and fail-closed retired/reset/corrupt outcomes. IndexedDB
profile V1 still cannot release a long-lived exclusive Rust owner: every
mutation fence is revocable between transactions. Consuming ownership requires
a separately held lock, transaction-coupled semantic admission, or an explicitly
revocable/speculative branch. The provisioning contract must not treat a
checked root, exact envelope match, or in-memory compaction as storage authority.
