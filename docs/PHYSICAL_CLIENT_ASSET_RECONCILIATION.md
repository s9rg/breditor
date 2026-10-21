# Physical client asset reconciliation

Contract status: implemented and selected functional qualification passed.
This is not V1 readiness or a durable activation contract. The separate canonical
source-reader repair below is also qualified.

The read-only asset requirement check joins the current native server's retained
bindings with declared client bindings and complete upload content IDs. A native
binding is an opaque asset plus its exact generation. An unreferenced upload has
only its canonical content ID; no synthetic native generation is invented.

The existing 64 KiB continuity endpoint and saved formats stay unchanged. The
separate POST `/recovery/physical/v1/assets/check` uses the same explicit operator
accounts, exact Origin policy, live controller nonce and A/B/C selection. Its
closed request family is `breditor/physical-room-recovery-asset-requirements`
version one. Bindings and upload IDs are unique and ordered by exact UTF-8 bytes;
strings are never normalized. The combined server/client requirement union is
bounded to 100,000 entries and complete request/response bytes to 32 MiB. These
are refusal bounds, not approved memory, latency or public-host budgets.
The declared-query grammar does not expand the existing native AST identity
grammar: actual image asset/generation identities keep their original checked
1–128-byte ASCII syntax. A declared query is not a genuine native capture.

The native server resolves the complete binding union together so one opaque
asset cannot acquire different bytes across server/client generations. Canonical
upload IDs are checked independently against actual native raster bytes. Missing
opaque mappings, binding bytes and standalone upload bytes remain distinct
Pending reasons. Corrupt or divergent immutable bytes refuse; no receipt or
status field substitutes for current byte admission.

The new result family `breditor/physical-room-recovery-asset-read` version one
pins the exact selection and SHA-256 of the actual request bytes. Two complete
native/provider reads bracket encoding. All provider callbacks precede a final
actual native/raster source comparison. Authenticated handlers waiting for body
bytes retain no native/provider ownership; real native workers retain their
leases until completion. The existing two-handler quota is shared by both reads.

The SDK integration derives bindings from genuine held original/generation
captures, preserves every dependency Pending and snapshots each actual complete
upload store under its native-source guard. It rechecks those same snapshots
after the native read, compare immutable metadata, and retain local queue work
separately from provider byte readiness. Uploaded status is not provider proof;
provider bytes do not silently settle pending, cancelled or failed upload work.

`SharedPhysicalRoomRecoveryHost.checkAssets` checks declared requirements only.
`SharedPhysicalRoomClientOperation.checkNativeAssets` derives those requirements
from actual privately reserved original/generation owners and whole upload
archives. Its detached result is `breditor/shared-physical-room-native-assets-check`
version one, not a durable receipt. Dependency Pending refuses a partial binding
query; the method checks native continuity and reports the unresolved source.
Whole upload archives are admitted sequentially and disposed after inspection;
the method does not retain every client's decoded archive at once. Unique local
requirements are bounded while collecting them, before constructing a request;
the native server separately bounds its complete server/client union.

Neither read mutates native history, marks an upload complete, transfers an owner,
deletes historical files or authorizes activation/garbage collection. The durable
whole-room coordinator, selected-client credential reconciliation, independent
comment-generation sessions, historical-copy decisions and authenticated native
activation fence remain required. All thirteen V1 gates remain open.

## Verification and next repair

The [2026-10-21 qualification](qualification/2026-10-21-physical-client-asset-reconciliation.json)
passes 34 selected stages from the 216-check functional plan, not the full plan.
Complete relay suites pass 379 server-enabled and 267 no-server tests/doctests.
The script suite passes 1,608 tests with three existing opt-in skips; source and
fresh offline public packages each repeat 108 joint reads, eighteen writable
generation-author reads, 120 asset requests and six late-read parent-close
refusals. Native tests additionally admit real PNG/JPEG/WebP bytes. The SDK
fixtures retain two actual PNGs, one without a native binding, and keep both
clients' pending/cancelled queue entries unchanged.

An earlier native test run failed before establishing its incomplete-body
precondition. The test now observes actual HTTP Continue handshakes and final
refusals instead of guessing request scheduling. Immediate quota refusal, early
cold B reopening and future history assertions remain mandatory. No production
behavior was changed to pass that test.

A separate read-only real-Wasm audit reproduced a source-reader defect: replacing
public core reference/guard methods could make an existing genuine capture report
zero bindings while the native owner had one. The
[canonical reader repair](qualification/2026-10-21-canonical-native-source-readers.json)
binds reference, packet and borrowed recovery reads to module-initialized facade
intrinsics. Its exact unchanged probe fails on the retained prior public archive
and passes twenty source and twenty fresh installed cases, including genuine
source mutation refusal. The existing 1,000-check generation guard stays
lightweight and keeps its original error ordering. This is facade-override
correctness, not an arbitrary-host JavaScript/native-module sandbox; no file
loss, native mutation or service activation occurred in the audit.

The follow-up passes 17 selected SDK stages and 1,610 script tests with three
existing skips. Complete relay evidence is carried only across byte-identical
native inputs and all six unchanged shared runtime files; those native suites
were not rerun in the SDK-only follow-up. All thirteen V1 gates remain open.

With the paired normal runtimes already built by the candidate pipeline,
reproduce the new SDK path from the repository root with
`node scripts/check-physical-recovery-assets-sdk.mjs` and
`node scripts/check-physical-recovery-assets-installed.mjs`. Closed wire laws use
`node --test scripts/physical-recovery-assets.test.mjs`; the native controller
suite uses the named `relay-physical-recovery-control-native` candidate stage.
Node storage, locks and raster presentation are explicit fixtures, not browser
or physical-input qualification. All six shared runtime files and the browser
and rich-content package archives remain byte-identical; the collaboration SDK
archive changes. No version, tag, publication or V1 gate is promoted.
