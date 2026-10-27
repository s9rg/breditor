# Native actor custody during recovery

Recovery must hold each document and comment writer lock continuously while it
replaces a local native session. Releasing the old lock before opening the target
would let another session reacquire the same actor. The private persistence SDK
uses escrow: a recovery owner keeps the actual locks while a staged target borrows
their release handles. This is local resource ownership, not server authorization.

## Source admission and scope

Only an actual stopped persistence owner can donate its actors. The source helper
checks private fields, the original core binding, actual actor identities and
settled persistence work. An active read-only document is not stopped. Replaced
core getters, copied identities, public assertion methods and directly constructed
JavaScript objects cannot supply custody. Runtime construction keys are required
because TypeScript private constructors do not remain private in JavaScript.

The source's old lease handles become terminal when escrow takes ownership.
Closing those aliases neither releases the real locks nor waits for a replacement
session to finish. The old editor stays stopped; actor handoff never retires a live
editor or acknowledges a pending write.

## Target opening and failure

A private input binding selects one exact native factory family, database, room,
document writer and optional comment actor. Existing factories acquire their own
locks normally when this private binding is absent. Public option fields and
persisted phase labels cannot select a borrowed lock. Known SDK normalizations
forward the private selection without changing existing backup formats or defaults.

A failed target's canonical Close returns its borrowed handles to escrow without
releasing or reacquiring the real origin-wide locks. Only one target can borrow
each actor at a time. Rollback checks the actual loan handles: an unsettled factory
or live target refuses, while completed real cleanup permits retry even without a
factory completion label. Untaken handles remain the input's cleanup obligation.
Existing mutable-factory waiting and cancellation contracts remain unchanged.

## Cohort transfer and final ownership

`StoppedActorCohort` checks every selected source, identity and duplicate binding
before moving any actor. It snapshots ordinary selection data before inspecting
native owners. Its synchronous transfer has no host callback or asynchronous gap.
The cohort holds its escrows privately rather than exposing per-member commit.

The executor must independently admit its complete replacement root before calling
Commit. Commit first checks every real target loan, then promotes all selected
handles without a host callback or await. Stale recovery cleanup can no longer
release those final target locks. Close likewise checks all members before
releasing any lock; a later live borrower cannot cause partial earlier release.
Actual rejected cleanup remains retryable through the same owner.

## Required whole room integration

This private handoff covers the shared, paired, segmented, independent-history,
segmented-relay and independent-delivery persistence factories. Functional laws
exercise exact native histories, nonempty offline delivery packets, named
selection/typing/search/reviewed policies, mixed owners and future Undo/Redo.
Controlled IndexedDB and Web Locks tests do not establish physical crash durability.

The whole-room executor still needs a durable complete namespace choice, actual
operational-parent integration, selected-upload adoption and interrupted per-target
journal replay before exposing a replacement room. A local lock does not fence
another device, prove compatible native union, acknowledge provider delivery or
activate an authenticated account generation. Those remain separate V1 requirements.
