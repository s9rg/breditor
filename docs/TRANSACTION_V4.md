# Experimental transaction V4

Status: feature-gated Rust transaction requests, behind
`experimental-structural-properties`. Not enabled in the shipped Wasm/browser
profile. Complete session persistence is a separate [V4 checkpoint](SESSION_CHECKPOINT_V4.md).

## Envelope and payload contract

`TransactionJsonCodecV4` accepts only `breditor/transaction-request` with
`formatVersion: 4`. The exact envelope fields, in deterministic encoding order,
are `format`, `formatVersion`, `schema`, `schemaFingerprint`, `baseSnapshot`,
`operations`, `selectionRelocation`, `selectionUpdate`, `pendingFormatsUpdate`
and `metadata`.

V4 retains V3's snapshot, selection-relocation, explicit selection update,
typed pending-format update and metadata records without reinterpretation.
Snapshot revisions remain canonical decimal strings, not JSON floating-point
numbers. Required fields, duplicate rejection and unknown-field rejection remain
strict. Operation arrays contain the raw [operation V4 payload language](OPERATION_V4.md),
not nested singular-operation envelopes. A primitive has no independent schema
binding: the transaction's admitted binding governs every operation.

The four paragraph operations retain their earlier payload shapes, and the new
`textBlockKindChange` payload is admitted explicitly. The active schema still
decides which operations it supports. A structural envelope cannot grant an
ordinary paragraph schema the heading capability. V1–V3 remain closed and
reject V4; V4 does not sniff, upgrade or silently reinterpret older envelopes.

## Admission order and bounds

1. The supplied base must use this codec's exact process-local context. The
   outer input must fit the configured UTF-8 JSON byte budget.
2. Check format/version, strict envelope shape, schema selector and fingerprint.
3. Parse and match the exact base lineage/revision before interpreting payloads.
4. Count borrowed raw operation items before constructing any operation. Stop
   at the first count excess. The reported count is a lower bound, not a claim
   to have traversed the rest of the array.
5. Decode each operation through the strict V4 primitive boundary and validate
   it against the context. Return an indexed, typed payload failure if needed.
6. Preflight and reconstruct selection policies, typed pending formats and
   metadata using their existing checked value contracts.

The count pass keeps constant auxiliary state. The decode vector starts with
at most 256 reserved slots and grows only for admitted operations. Each source
and derived-result fragment retains its ordinary document/text/property limits.
Combined retention is bounded by the request's byte limit and operation count;
the sum of sequential fragments need not fit one document's node budget. Final
document validity is checked separately during transaction application.

Encoding first checks context and operation count. It serializes through the
borrowed V4 payload encoders and a bounded byte-counting pass before allocating
the output string. Invalid operations retain their indexes and typed codec
errors, rather than becoming an unexplained serializer failure. No size limit
or operation limit is relaxed by selecting V4.

## Decode is not application

A decoded request has not yet proved that its guards match live content or that
all intermediate/final document states and explicit updates can be admitted.
Application is the existing atomic Rust transaction path:

- Sequential source guards see the preceding operation's result. Two operations
  cannot both claim an unchanged paragraph if the first made it a heading.
- A stale later guard, a later result-budget violation or an invalid final
  selection/pending-format combination publishes no preceding content edits.
- Document, revision, selection, pending formats and retained redo remain
  unchanged on rejection.
- A successful content batch is one history event under `Record`. Exact undo
  restores the initial tree and editor values; redo restores the final ones.
- `Merge` and `Ignore` retain their established session semantics. A net-zero
  content batch remains a content event, not a no-op. Empty unchanged requests
  consume no revision; state-only changes preserve redo without adding content
  history entries.

Persisting a base with Editor State V3 and decoding it under an independently
constructed, identically bound context permits a V4 request to replay against
that restored base. This proves portability of the request, not preservation of
an entire session's history cursor or undo/redo branches.

## Remaining durability work

The separate Session Checkpoint V4 now encodes chronological forward recipes,
retains the undo/redo cursor and current revision, and reconstructs each boundary
with locally derived inverses. It enforces aggregate history limits and proves
forward/inverse replay before publishing a restored session. Existing
Commit V3 and Session Checkpoint V3 reject heading operations; they are not
extended by this checkpoint. Commit and local-log formats remain separate work.

Browser heading-aware editing and toolbar support remain disabled. This codec
does not alter the public Wasm ABI, browser persistence route or package sizes.

## Reproduction

`cargo test -p breditor-core --lib --all-features --locked transaction_json_v4`
runs the transaction-specific tests. Use the filter `json_v4` to include the
operation tests and shared fixtures. Prefix with
`PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261003` for 10,000 cases in each
randomized property test. `npm run verify:release` checks the full release
boundary; it does not publish anything.

The [qualification record](qualification/2026-10-03-heading-transaction-v4.json)
records the fixed-seed property runs, full release results, unchanged shipping
sizes and source/log hashes for this checkpoint.
