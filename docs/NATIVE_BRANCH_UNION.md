# Atomic native document and comment union

Breditor can stage compatible document and comment histories together and publish both native owners at one boundary. A late comment permission, anchor, byte-limit or document adoption failure leaves both original targets unchanged. The current local document and comment Undo/Redo histories remain authoritative; peer inputs cannot manufacture an unknown local-author history.

This is an in-memory native operation, not complete durable room recovery. Packet queues, versions, uploads, provider state and authenticated serving authority still need their surrounding recovery workflow.

## Historical comment authority

Every newly admitted foreign comment event needs an explicitly supplied original authorization range. Each range names the actor, principal, original access, inclusive positive decimal counters and the exact native actor-prefix digest at its end. The host must obtain both that prefix and the original role from independently authenticated history or equivalent validated original-author evidence. Reading them from an incoming checkpoint alone establishes neither authority nor authorship.

The Wasm boundary verifies the supplied prefix against the actual native source. Missing ranges, wrong principals or digests, overlapping ranges and insufficient permissions refuse. Separate ranges preserve historical role transitions; a current comment-only role cannot silently replace an original moderation grant. Checkpoints do not store or grant those permissions. When original authority is unavailable, the host retains the input and resolves it explicitly instead of guessing.

Local-actor source events must be an exact prefix of the target's native actor stream. Even a moderator range cannot import an unknown local suffix. Incoming events are ordered by their causal dependencies, not actor spelling or arrival timestamps, and each action is validated against its original causal context and actual native document anchors.

## Atomic staging and bounds

Rust prepares the document candidate and independently authorized comment candidate before either target changes. Exact metadata guards are checked before the fallible document adoption. An exclusive Rust borrow then permits callback-free, infallible comment adoption after document success. Source owners remain unchanged.

The selected SDK incoming-byte ceiling covers the checked sum of unique missing original document input blobs and canonical missing comment event bytes. Rust independently enforces that ceiling before staging or authorization callbacks; existing native hard limits remain. The SDK ceiling can tighten, not enlarge, its eight MiB default. Authorization metadata has a separate four MiB ceiling and at most 4096 explicit ranges. Event counters remain exact decimal strings through the full unsigned 64-bit range.

The genuine recovery reservation temporarily excludes the source facade as well as every selected target. Held or queued input refuses without consumption. One SDK publication exposes both committed lanes, and publication callbacks cannot edit a source, target, sibling comments or release exclusion midway. Read-only policies remain read-only; importing peer history never temporarily unlocks either writer.

## Separate versioned capabilities

The native_branch_union version-one capability provides combined input accounting, pure coverage and atomic mutation. The SDK-private reservation exposes reconcileNativeBranch; supportsNativeBranchUnion and verifyNativeBranchUnion discover and read the corresponding native contract. Detached authorization and outcome types provide no executable custody or serving grant.

Existing document-only reconciliation, exact recovery-origin methods and the earlier paired coverage gate keep their original meanings. Original wire, journal and model versions and ordinary constructor/storage defaults are unchanged.

## Immutable files and room integration

Comparable original and segmented comment histories keep every existing target root and sealed file unchanged. A source's unsealed peer events can append after a later comparable target seal. Incomparable immutable generation branches, different local identities and missing local contributions refuse rather than selecting a timestamp winner or discarding an input. A retained branch-graph and writer-lifecycle workflow remains required for those cases.

The operation does not affiliate an unbound comment lane, acknowledge pending input, accept a suggestion or merge packet/upload stores. Durable whole-room union must retain complete original files, journal intent before mutation, conserve all dependent queues and assets, recover interruptions and join the existing authenticated serving fence. All thirteen V1 gates remain open.

## Untyped review export inputs

The SDK now rejects non-string review export counters before crossing the Wasm string boundary. Existing default and valid string semantics are unchanged; the original native counter grammar still decides string validity. This closes a reproduced invalid JavaScript input path that previously reached the generated allocator instead of returning an SDK input error.

## Functional checkpoint

The [focused qualification](qualification/2026-10-27-native-branch-union.json) records 1,419 passing Rust tests, including 24 profile/history combinations in the paired integration case. All 65 focused laws pass from source, an offline-installed package and an actual production bundle; 19 strict consumer fixtures and 112 combined SDK/runtime checks pass. Four source cases also preserve existing complete-record reads across seven families and four history combinations. Those compatibility reads are not durable seven-family union or authenticated network grant-fetch qualification.
