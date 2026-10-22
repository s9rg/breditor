# Independent history delivery and atomic recovery

`SharedIndependentDeliverySession` owns independently selected document and
comment histories, relay progress, pending suggestion decisions, immutable
revisions and published-version intent. Its complete state commits in one
IndexedDB transaction. A recovered writer must never resume with a delivery
receipt ahead of its native history, or lose an offline review packet because
only the document checkpoint was saved.

This is a separate, explicitly selected SDK storage family. It reuses the
original Rust history and wire formats without adopting another editor's
protocol or changing Breditor's existing defaults. It is not yet a participant
in physical whole-room recovery or authenticated room activation.

## Explicit native and retained selections

The host chooses `documentHistory` and `reviewHistory` independently, each as
`original` or `segmented-v1`. All four combinations use the actual native
checkpoint readers and cold replay. The existing document selection, typing,
reviewed-history and search policies remain explicit. Each segmented lane has
its own root, sealed files and active generation; the two lanes may reuse a
generation name without sharing a file identity.

`binding` names the nonsecret document and comment identities. The three
`retained` selections name the exact suggestion queue, revision outbox and
version catalog, or explicitly select `null`. Reviewed document histories and
document-wide selections require the atomic V2 transport. Ordinary original
histories also support the existing original V1 transport; retained features
keep their own original transport requirements.

Credentials, tokens, cached grants and authorization decisions are not part of
the saved head or recovery DTO. Opening and restoring apply current host document
and comment policy. Reconnection authenticates again. A permanent observer keeps
its zero author prefix even if its account later receives an editor grant.

## One complete storage cut

A dedicated version-one database contains only `delivery_history_files` and
`delivery_history_heads`. Local-only `history_files` and `history_heads` remain
unchanged. Each opener rejects the other schema before invoking native creation
or restoration; opening never migrates data by recognizing payload fields.

The closed head format is `breditor/shared-independent-delivery-head`, version
one, with `source`, `relay`, `retainedBinding` and `retained`. `source` is the
unchanged independent native-history head. Native files are keyed by room,
writer, lane and generation, with exact canonical bytes and hashes.

The native files, paired source head, native local versions, relay progress and
all three retained records commit together. Compare-and-swap uses the complete
previously acknowledged outer head, not the document clock alone. Immutable
native files cannot be overwritten. Missing files referenced by an acknowledged
head are corruption, not an invitation to regenerate them silently.

Current in-memory progress and acknowledged durable progress are different.
`exportRecovery()` preserves current readable work, including an uncertain save;
`relayProgress()` and `retainedRecords()` report acknowledged storage. A failed
save cannot advertise durable delivery or ready review state. After a lost
acknowledgement, retry first verifies the exact uncertain cut before saving newer
native or outbox work. It does not submit the accepted change twice.

## Genuine ownership and named adapters

Use `createSharedIndependentRelaySync`,
`createSharedIndependentReviewRelaySync` and
`createSharedIndependentSuggestionObserverRelay` with the genuine session.
Private runtime admission binds each adapter to the actual owned native core
and actual save operation. Structural lookalikes, copied constructor keys,
public `core` getters and public `flush` overrides cannot supply ownership.
Legacy constructors refuse these owned cores with
`independent_delivery_required`, including the original-document combination.
Unmanaged original editors keep their original adapter semantics.

The session's queue, revision and version factories co-own the same transaction;
they do not open fallback auxiliary databases. Factory methods refuse automatic
network startup before adoption. Native-only captures and old generation
captures refuse the full delivery session rather than producing an incomplete
backup that drops pending work.

The distinct [complete participant contract](INDEPENDENT_DELIVERY_PARTICIPANT.md)
adds a genuine full source capture and portable native/retained/raster/upload
archive. It preserves current readable failed-save work without treating a
native-only reader as proof of all outboxes. Component recovery remains separate
from unfinished durable multi-participant coordination and activation.

## Recovery and retirement

The closed `breditor/shared-independent-delivery-recovery` version-one DTO carries
the complete native source, relay state and selected retained records. Restore
requires an absent destination, matching nonsecret bindings, current policy and
the host's explicit `writerRecovery: 'host-reacquired'` assertion. Native replay
admits actual history, receipt prefixes and retained packets before publication.
The assertion records a host responsibility; it is not server authentication.

Close stops networking and retires the actual native owner synchronously. A
failed final save retains readable work and writer ownership for retry or backup.
Explicit discard waits for in-flight storage acknowledgement and releases all
actual component and native leases, even if the caller disposed the core first.
A database version change retires adapters and requires explicit recovery or
discard; it never retargets a live source.

Asynchronous local-version preflight refuses with `independent_history_stale`
if native or retained state changes while validating the complete prospective
cut. No version is partially retained. A caller may retry the same immutable
packet against the new state, or pause networking before capturing a checkpoint.

## Bounds and remaining integration

Original native and retained-record bounds still apply. The outer head allows
224 MiB plus 64 KiB and the complete recovery DTO allows 352 MiB plus 64 KiB;
these do not increase any nested native or store limit. The existing 1,000-input
Undo bound remains a safe explicit refusal, not a completed long-session policy.

Functional checks cover five native grammar/inline profiles, three editing scopes,
all four lane combinations, cold native replay and future Undo/Redo. Authenticated
loopback checks cover both wire versions, offline peer work, review acceptance,
revision supersession, versions, uncertain receipt saves, rollback refusal and
permanent observers. Fresh offline packages repeat the same assertions without
workspace links. Storage, locks and controlled failures in those checks are
synthetic; they do not establish operating-system crash durability.

Physical room/asset participation, independent server-log generations, durable
whole-provider/client reconciliation and authenticated activation remain separate
architectural work. All thirteen V1 gates stay open. This contract does not
promote a version, freeze the public API, publish a package or approve V1 parity.

The [functional qualification](qualification/2026-10-21-independent-delivery.json)
passes 53 selected stages, 1,752 script tests with three existing opt-in skips,
and fresh complete native suites of 379 server-enabled and 267 no-server
tests/doctests. Source and installed packages each repeat 120 local native and
88 authenticated network cases plus 32 focused laws. Twelve installed reports
retain identical package hashes. The exact final legacy-adapter regression fails
on the preserved older archive and passes on the repaired source and package.
