# Native recovery reservation

Coordinated recovery must prevent a publication callback from editing another
client while accepted operations are being imported. The SDK-private native
reservation excludes publication through every actual member's facade. The
selected-owner context adds genuine root ownership, selected asset exclusion,
cancellation and serialized complete snapshots. Neither API supplies server
authentication, a durable recovery journal or room activation.

## Common native exclusion

`reserveNativeRecovery(cores)` accepts a detached dense list of distinct genuine
facades. It checks every member before the first reservation flag changes. The
common commit contains only private flag writes: no application callback,
public method, native call or asynchronous work runs between members. A failed
preflight leaves the entire supplied set unchanged.

An existing remote hold, queued frame, active publication, overlapping
reservation or retired/disposed member refuses acquisition. The reservation
does not flush, drop, cancel or acknowledge existing queued input. Its private
imports admit original document and review frames synchronously through Rust.
Document frames retain each member's configured incoming-byte ceiling even
though the private admission is synchronous and creates no queue entry.
Review source data is detached without executing accessors; native policy,
anchor, dependency and own-author collision checks remain authoritative.
Pending review dependencies remain pending, not a receipt.

Local actions, selections, Undo/Redo, permission changes, persistence-policy
sealing and new remote publications all refuse through public aliases while
reserved. Reads and retained-receipt checks remain available. No read-only bit,
history policy, selection or Undo item is changed to implement exclusion.
The native import path publishes through the existing facade and persistence
subscribers, so actual owning sessions still observe accepted operations.

A callback cannot use the reservation to import into another member or release
the common barrier during publication. Closing the reservation is otherwise an
idempotent, callback-free flag release. It clears retained member references.
Retirement and disposal remain available to owning lifecycles; either
invalidates the whole reservation and never revives a terminated member.
The primitive accepts at most 4096 members, covering the existing physical
catalog file ceiling. Selected-owner reads retain their existing tighter limits.

## Genuine selected owner context

`withSelectedNativeRecovery(owner, reads, visit)` is an internal coordinator
composition, not a package-root callback API. Its private class admission
obtains the actual root and exact native clients directly. A copied owner,
report, public override or proxy cannot substitute those resources. The owner
and all clients are reserved before input inspection and fresh authority calls.
Actual already-running native persistence and selected asset jobs are observed;
no implicit retry, upload or source save is started as preparation.

The context retains the existing owner and namespace leases and blocks its
selected asset ports. Complete source, packet and whole-upload read reservations
are acquired and released per phase. `capture()` returns a fresh full cut;
`readReconciliation(host)` uses the same all-author and provider reader as the
ordinary selected owner. Imports refuse during a read phase, and overlapping
reads refuse. The next phase starts only after actual reader cleanup, so an old
native witness is never reused after an import changes its source.

Existing ordinary capture and reconciliation entry points keep their defaults.
Only the private context can borrow its own owner reservation for nested reads.
The scope cannot release native exclusion early. Escaped scope methods expire
at completion. A read started without awaiting it is cancelled and drained
before exclusion is released; it cannot become a detached successful operation.

## Failure and close behavior

Fresh authority, cancellation and actual native lifetime checks surround scope
work and final return. Every import obtains a fresh synchronous grant before
Rust admission and again after publication. Grant callbacks cannot recursively
import or start a complete read. An independent caller-cancellation observation
survives asynchronous reader cleanup. After that cleanup, a fresh grant and
actual owner/native checks run while every member is still reserved. This
synchronous final fence and flag release share one continuation: there is no
promise gap that can turn a cancelled or revoked handoff into success. The
expired scope cannot be used by that final grant callback to import again.
Closing the owner synchronously retires every member; selected namespace
cleanup waits for the outstanding context and actual read cleanup. Caller
cancellation can invalidate a result after Rust has already
admitted an import. That edit remains present. Failure does not roll back native
history, pretend the import never happened or acknowledge durability.

The enclosing durable importer must retain the exact before-cut and authenticated
input before its first mutation, record real per-client progress, and resume
after interruption. It must preserve partial outcomes, offline suffixes and
both Undo lanes, then repeat complete reconciliation and fresh provider/native
authentication before its durable decision. Unbound local comments need a
separate adoption operation. Serving activation requires its own old-write
exclusion and durable final-cut decision.

## Functional checks

Real Rust-backed tests reproduce the ordinary sibling-callback edit and verify
that common exclusion prevents it for all four original/segmented history pairs.
They cover source getters, actual queue ownership, native refusals, pending
review dependencies, terminal lifecycle changes and future document/comment
Undo. Subscriber errors are explicitly observed so swallowed callback assertions
cannot produce a false pass. Genuine selected-owner tests use seven actual
client families, full before/after cuts, authenticated accepted payloads and
all-author reconciliation. Scope cancellation and close tests preserve admitted
changes and wait for actual outstanding work. A two-microtask reproduction
changes the real abort signal, permission or owner lifetime after the visit's
pre-cleanup check and verifies that the final handoff refuses all three. These
are functional storage and
native-owner checks, not physical durability or full V1 qualification.
