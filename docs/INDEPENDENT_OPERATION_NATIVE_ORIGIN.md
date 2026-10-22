# Independent native origins before autosave

The private independent-operation origin verifies that an actual document and
its independently selected comment history continue from a retained complete
participant. It runs before initial source autosave and later persistence
captures. A valid stored document from another native branch must not be saved
merely because its final AST or historical identities look compatible.

This is the native admission layer for a future durable operation owner. It does
not yet account for retired outbox work, retain operational intent, adopt a whole
participant into a room or authenticate room activation. The existing complete
recovery coordinator still returns both lanes read-only.

## Genuine immutable origin

`IndependentNativeOperationOrigin.read` consumes the actual prepared recovery and
SDK-created complete participant backup. Canonical backup readers check the
selected identity and original file. Host-selected native factories replay the
original document and comment checkpoints in a private read-only editor without
acquiring another document or review author lease.

Both native families remain independently selected. The replay preserves typing,
range, document-selection, search and owned-review policies. Actual native packet
and relay-receipt admission runs against that replay, and both resulting native
checkpoints must equal their selected originals. Serialized metadata cannot
construct an origin or select a restore factory.

Verification uses the matching Rust original or segmented ancestry check, which
also covers the selected comment history. Every original immutable local-version
packet must remain present; adding later local versions is allowed. Original file
availability, read-only origin state and current host checks remain live
requirements. Module-initialized native methods prevent late public facade
replacement from substituting a successful check.

## Actual autosave and transaction boundary

A private factory selection attaches the origin guard to the actual independent
history owner. Public options, recovery JSON and ready markers cannot select it.
No new origin or opener is exported from the package root.

The constructor verifies both native histories and the retained local versions
before its first autosave. Persistence captures repeat that verification. A
failed insert-only native admission can leave an empty dedicated schema, but
publishes neither a source head nor immutable native files.

Current origin and host checks also run before the source transaction, inside
its head/file callbacks and after commit before acknowledgement. Refusal within
the transaction aborts all its writes. A failure after commit retains the exact
unacknowledged attempt; retry recognizes the already committed head and files
without rewriting them. These remain the existing single-database compare-and-
update and lost-acknowledgement rules, not a cross-database atomic transaction.

## Readable work and cleanup

Persistence verification is separate from read-only recovery capture. Losing
current authority or disposing an origin blocks further persistence but does not
hide the live source's unsaved native histories and retained records. The caller
can export readable recovery before explicitly discarding or closing resources.
An export is data, not permission to reconnect or write.

Failed native factories free their unreturned owners. A source refused before
autosave releases its actual writer leases, allowing a fresh explicit retry.
Closing the origin disposes only its private read-only replay; it never disposes
the editor borrowed for verification.

## Remaining durable operation ownership

Native ancestry cannot prove that a pending suggestion, revision or version was
not dropped. Existing Stop retrying and Forget actions are legitimate, including
several actions coalesced into one saved cut. An operation owner must distinguish
those actual transitions from missing work without resurrecting cancelled
decisions or requiring every old cache row to remain active forever.

The next durable contract must retain the immutable original and bind actual
current and pending source cuts before publication, reconcile interrupted commits
and preserve the real source/outbox transaction. It must coordinate whole-upload
custody with genuine owners, keep old readers closed to any new stored family,
and require fresh current policy rather than deriving a grant from an archive.
Room adoption, provider/client closure, independent server-log generations and
authenticated activation remain required integrations.

## Required functional checks

Both candidate profiles require `independent-operation-origin-contracts`,
`independent-operation-origin-type-fence`, `independent-operation-origin` and
`installed-independent-operation-origin`. The focused laws cover actual native
fork refusal before source writes, local-version loss, late facade replacement,
transaction revocation, readable unsaved work, lost acknowledgements and native
factory cleanup. The source and fresh installed-package matrix covers 640 legal
native-policy combinations: 480 atomic-transport cases with all three retained
stores and 160 original-transport cases with the supported version outbox.

IndexedDB, locks and raster presentation are controlled fixtures. These checks
exercise actual normal Rust/Wasm histories but do not establish platform crash
durability, performance budgets or V1 release approval.

## Functional qualification

The [selected qualification](qualification/2026-10-22-independent-native-origin.json)
passes 32 checks from the 254-check functional plan. Source and fresh installed
packages each pass the same 640-case matrix and 22 native-origin laws. The script
suite passes 1,952 tests with three existing opt-in skips, and the editor
integration suite passes 385 tests. Nine fresh installed consumers pin matching
archives. One setup refusal for stale native fixtures is retained alongside the
actual producer runs and successful rerun; no fixture metadata was relabeled.

All native inputs and twelve normal shared/rich runtime files remain unchanged.
Complete Rust-suite evidence is carried from the preceding checkpoint; both
native inventory fixture producers were rerun. Durable pending-work accounting
and complete operational ownership remain the next implementation boundary.
