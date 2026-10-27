# Native document branch reconciliation

The SDK can retain a compatible native document branch without replacing the current writer's Undo or Redo history. The source and target must share the same original native document, writer, schema and history modes. The target must already contain every source-owned contribution in its original order and grouping. The operation adds missing peer inputs; it cannot reconstruct an unknown own-writer suffix from server text or a causal counter.

This is a document-only native primitive. It neither adopts comments nor reconciles packet stores, asset providers or whole-room serving authority. The existing exact-entry recovery-origin checks keep their original meaning and can still refuse a branch after this separate contribution-coverage check succeeds.

## Compatible native contributions

Rust compares every source non-Remote journal entry, including complete commands, expected effects, Undo and Redo records, selection recipes and owned suggestion history. Those entries must be an exact prefix of the target's corresponding entries. Natural typing joins are compared at the same contribution positions, not by journal offsets displaced by remote arrivals. Visible document equality, account labels and equal Undo depths are insufficient.

Every causal prefix admitted by the source is compared through actual native operation records. A same-counter peer fork refuses rather than selecting a copy by timestamps. Unknown own history and incompatible native families refuse before the real target changes.

All imports run on one private native candidate. Ordinary schema admission, update limits, local read-only policy and history validation still apply. The candidate publishes only after final coverage succeeds. Failure leaves both input owners intact, and repeating an already retained input does not create another publication.

## Pending inputs remain independent obligations

An input pending in the source remains an exact retained byte sequence even if the target already knows those counters from another frame. Target counters alone do not prove which bytes the source retained. The new operation preserves that obligation in a new Remote entry when ordinary semantic receive would otherwise omit or minimize a known transport echo. It never rewrites a previously retained target entry or changes ordinary receive defaults.

Successful retention does not acknowledge a relay receipt or assert that pending operations have been applied. The host must retain original source files and resolve missing dependencies and provenance through the surrounding recovery workflow.

## Facade exclusion and permissions

The SDK-private NativeRecoveryReservation.reconcileDocumentBranch(target, source) requires a genuine selected target and a genuine quiescent source facade. A source with held or queued remote frames, an active publication or another recovery reservation refuses without consuming that work. Copied interfaces and prototype-shaped objects cannot supply the private state.

An otherwise unreserved source is temporarily excluded across the native call and target publication callbacks. Reentrant source edits, target edits, comment edits and reservation release refuse. The operation releases only its own temporary source flag afterward; an existing cohort reservation stays held. The selected owner's native-execution wrapper retains its usual fresh authority checks and retirement-on-uncertainty behavior.

The separate version-two Wasm capability is retained_document_branch_version with a native input-byte read and guarded reconcile and verify methods. The SDK checks the actual target incoming-byte ceiling before publication and passes that ceiling into Rust, which independently enforces it before staging. The byte read counts unique source input blobs not already retained verbatim by the target. A stale unbounded version-one runtime does not satisfy this capability. Unsupported runtimes refuse without a JavaScript merge fallback. SharedRichEditor.verifyRetainedDocumentBranch is a pure document-coverage check, not a storage capability or a paired-comment proof.

## Immutable generations and current limits

Segmented sources require the same exact retained root and sealed-file prefix, including the source's active generation identity. Current root and sealed files are not rewritten by reconciliation. An original source can be covered by an already segmented target through this explicit contribution contract; this does not relax the older migration-origin check.

Incomparable sealed-generation branches still refuse even when their visible documents could merge. A retained branch-graph contract is required to handle that case without discarding immutable files. Another writer identity or a missing own-writer history also requires separate recovery work.

## Functional checks and remaining integration

Native tests cover all 144 profile, scope, typing, reviewed and search combinations, real typing-group disagreement, pending dependencies, same-counter forks, read-only policy and eight segmented-history combinations. Future Undo and Redo are checked after genuine cold native replay. SDK tests use the canonical application Wasm in seven core configurations and exercise callback exclusion, queued input preservation, incomplete capabilities and unchanged independent comments.

These checks cover the primitive and its guarded SDK bridge, not seven complete persistent-family recovery runs. Durable whole-room union still needs immutable full inputs, packet and upload conservation, authenticated source selection, per-client progress and interruption recovery. Explicit comment adoption, writer lifecycle and authenticated whole-room activation remain required before this becomes a complete recovery workflow. All open V1 gates remain open.

The [focused checkpoint qualification](qualification/2026-10-27-native-document-branch.json) records 142 native tests, 25 SDK laws in each of source, offline-installed and actual production-bundle execution, 17 strict consumer type fixtures and 70 combined SDK/runtime-surface laws. A real unbounded-runtime byte-limit failure is retained beside the repaired SDK and direct-native regressions. Earlier full recovery-corpus qualifications remain tied to their recorded runtime; this focused checkpoint does not replace them.
