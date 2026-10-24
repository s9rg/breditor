# Protected operational history references

`captureOriginalOperationalHistoryReferences` and
`captureGenerationOperationalHistoryReferences` explicitly combine protected
parent archives with all actual current native and packet records. The existing
`captureReferences` methods retain their source-only scope and defaults.

## Archive replay before current records

The original reader re-admits its actual operation archive and ready recovery
marker. The generation reader independently re-admits both actual protected
archives and their records. It does not substitute a cached origin, one valid
copy, current packets or a current upload store for those files.

The host explicitly selects a native restore factory. Every archived native
state replays read-only in that selected runtime before the current committed,
uncertain-attempt where applicable, pending and LIVE states. Exact checkpoints,
descriptor, language, sealed policies, document/comment native ancestry, ordered
local versions and forward relay progress remain mandatory. A separately loaded
read runtime is supported; comparison against a writer in a different Wasm
instance or final AST equality is not a fallback.

Each archive contributes its native retained history and original version,
proposal and revision packets. A successfully forgotten image-bearing proposal
or revision can disappear from every current slot while remaining necessary in
the protected archive. The result retains that reference explicitly under
`origins`, alongside unchanged `current` diagnostics and the complete reference
union. Missing dependencies or uncached versions remain pending, not complete
availability. The combined union refuses above 100,000 asset/generation pairs;
each replay keeps the existing 1,024-packet limit rather than truncating it.

## Authority, lifetime and verification

Fresh read permission and cancellation do not reactivate an expired original
writer job. The opaque result exposes metadata, checks, verification and disposal,
not mutable producers, upload handles, handoff or activation authority. It owns
both parent and current-source read borrows. Parent leases stay held.

`verify()` rereads actual protected bytes and actual current records.
`checkCurrent()` performs the final callback-free custody, source, persistence
epoch and cancellation checks. Source changes invalidate the report rather than
refreshing it silently. Disposal clears callbacks and closes both read borrows;
detached immutable metadata remains readable without retaining read permission.

## Qualification and remaining architecture

The [qualification](qualification/2026-10-23-operational-history-reference.json)
passes thirteen selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 1,181 laws: 131 new history/lifetime laws and all
1,050 prior record/reference/storage laws. Nine strict consumer type fixtures
pass. The new language-3 matrix includes original unpaired/paired and four
generation storage families, three selection scopes and every compatible policy
mask. Archive-only forgotten proposal/revision images, mandatory native-proof
refusal, byte tampering, cancellation, late factories and callback release are
tested. Future document and comment Undo/Redo survive the reads. Existing
original operational checks retain 66 handoffs and 198 cold reopens; generation
checks retain six cases, 24 handoffs and 18 operational cold reopens.

This establishes reference addresses, not whole-provider byte availability or
activation. Synchronous fresh reservations across all selected room members,
integration of the five newer families, provider/client reconciliation against
current server authority, authenticated activation, sustainable history and
remaining parity are still required. All thirteen V1 gates remain open. Normal
Wasm, public-root exports, package versions and original protocol meanings are
unchanged. No push, tag, publication or deployment is promoted.
