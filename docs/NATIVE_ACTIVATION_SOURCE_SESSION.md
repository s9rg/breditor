# Persistent source ownership during native activation

`NativeActivationSourceSession` is a private SDK building block for the remaining
joint activation coordinator. It holds the actual selected seven-family source
reservation across separate commands. A rejected command or an uncertain native
request must not return the old clients to editing. Caller cancellation stops
command admission and signals the running command; it does not end the underlying
source visitor. Adapters still have to observe that command signal and account
for any request that might already have reached the server.

This contract complements [durable native activation](SDK_NATIVE_ACTIVATION.md)
and [retired actor transfer](RETIRED_ACTOR_HANDOFF.md). It does not change native
receipt, Pending, queue, upload ACK or original protocol meanings.

## Explicit lifetime

`begin` reserves the genuine selected owner synchronously. Startup happens after
the new session has been returned, and `ready` waits for its actual source scope.
Trusted SDK composition uses `withNativeActivationSources` to perform one command
at a time. Saved choices, copied sessions and structural resource descriptions
cannot supply that scope or release its reservation.

`suspend` freezes new ingress, checkpoints enlisted review/metadata owners, drains
their actual dependent delivery work, saves and flushes all sources, then durably
retires the complete original root. It retains actor custody. `close` joins an
existing cleanup attempt and releases that custody only after canonical original
cleanup finishes. Failed cleanup stays attached to the same session for retry.
Neither operation implicitly reopens the old editor. If a bound metadata child
was explicitly closed already, its review parent follows canonical Close rather
than manufacturing an incomplete review-only portable file.

`retirePrepared` additionally admits the complete current replacement recipe,
approval and final source cut. `intoExecution` transfers that exact reservation
to an already-returned `RoomExecutionAttempt`; the old root keeps all actors until
the attempt runs. Invalid target construction restores the original reservation.
A saved receipt or a merely closed owner cannot authorize this transfer.

## Durable close before actor transfer

The first integration reproduced `writer_lease_closed`: the attempted durable
shutdown moved actor leases before calling ordinary source Close. Ordinary Close
correctly refused its final save because its writer no longer owned a live lease.
The save assertion must stay intact.

The repair prepares an opaque deferred transfer on each original actual lease.
Preparing does not move or release that lease. The source can perform its normal
save and flush. Only the original lease's final actual Close transfers its lock
into genuine escrow instead of releasing it. Both old handles then become
unusable for writing. No ordinary writer acquisition occurs during transfer.

`NativeActorCloseRetention` retains all pending transfer plans before shutdown can
yield. Partial cleanup can therefore own a mixture of still-original leases and
already-captured escrows. Retry uses those same handles. Only after every source
has closed does complete actual escrow admission consume the plans into one
`StoppedActorCohort`. This resource transfer grants no server authority.

The existing discard-based retirement path keeps its original scheduling and
meaning. Normal leases without an explicitly selected deferred plan retain their
original release behavior.

## Implementation and verification

### Retrying an approved partial retirement

A later integration reproduced a separate retry defect: after the third actual
comment Close refused, all fourteen actor locks remained held, but every later
`retirePrepared` awaited the same rejected visitor Promise and returned its old error. Repairing
the underlying Close could not advance that same session into replacements.

Retry now finishes canonical durable cleanup under the same actual reservation.
Its expected preparation must match the original complete approved recipe; it
does not run new approval hooks or accept a different recipe after retirement
starts. An unprepared suspension cannot gain a preparation by presenting saved
data. Explicit terminal Close joins any in-flight retirement before consuming or
releasing actor custody, including reentry during input reflection.

The exact unchanged reproducer passes after repair. Three new source scenarios,
four existing source-session cases and both metadata lifetime regressions pass.
The seven retirement/source-session cases also pass from independently installed
packages, with strict private declarations and 2,835 matching distribution files.
They cover repeated actual Close failures, changed-recipe refusal, constructor
rollback, reentrant Close, all seven concrete replacement families, zero ordinary
writer acquisitions and exact future document/comment Undo/Redo. The original
source bytes remain unchanged. A test setup initially used an accessor as its
reentry trigger; strict parsing correctly refused it. The final scenario uses a
Proxy reflection trap and leaves accessor refusal intact.

The [qualification](qualification/2026-11-03-approved-retirement-retry.json)
retains failed/repaired runs, exact source, independent packages, Native fixtures
and public observations in a compressed read-back-verified proof. These checks
are scoped to retirement cleanup. The earlier full 60-case wrappers were not
rerun, and complete joint activation and all thirteen V1 gates remain open.

- `native_room_joint_activation/source_session.ts`: persistent actual source
  lifetime, command admission, explicit suspension and executor continuation.
- `persistence/native_actor_readiness.ts`: complete genuine-source preflight.
- `persistence/native_actor_close.ts`: complete deferred-close resource custody.
- `persistence/writer_lease.ts` and `review_writer_lease.ts`: actual final-Close
  capture and one-shot transfer, with unchanged live-lease save assertions.
- `physical_room_operation_v3/retained_root.ts`: normal durable source cleanup
  followed by complete actor-cohort construction, including partial-close retry.
- `selected_local_review_delivery/coordinator.ts` and
  `selected_local_metadata_delivery/coordinator.ts`: enlisted final checkpoints.

Build the SDK and retain the normal Wasm plus the existing
`complete_cohort_control_functional` and `selected_delivery_functional` fixture
executables before running `npm run test:collaboration:native-joint-source`.
`npm run test:collaboration:native-joint-source:installed` packs the three SDK
packages, installs them into an independent consumer without workspace links,
compares distribution bytes and runs the same tests and strict private types.
These are component checks, not the full V1 candidate profiles. The [qualification](qualification/2026-11-02-native-activation-source-session.json)
records 60 passing cases in each environment, strict declarations and exact
source/distribution byte comparisons. Earlier failures remain retained.

The startup fixture also refuses a genuinely missing executable promptly. Failed
spawn emits `error` without `exit`; cleanup must observe that actual lifecycle
rather than wait forever for an exit that cannot occur.

## Actual uncertain commit and cold recovery

`npm run test:collaboration:native-joint-source:unknown` runs both metadata lifetime
regressions and a genuine Rust commit whose reply is lost. The source reservation
survives the failed command; a separate command still reads the original unknown
intent. Explicit suspension checkpoints the real metadata and source stores while
all fourteen actors remain held. Explicit Close releases them before cold reopen.
The intent stays `request-started` with no invented receipt, pending metadata stays
literal, and all seven clients retain exact native checkpoints and future
Undo/Redo. This case uses cold reopening of original namespaces, not replacement
metadata relocation or a production joint publication API.

`npm run test:collaboration:native-joint-source:unknown:installed` executes the same
three-case workset from independent packages. The [qualification](qualification/2026-11-02-persistent-source-native-unknown.json)
retains exact source, complete intent data, Native observations and packages.
The existing `native_activation_sdk_functional` executable is additionally required.
The SDK/Rust implementation is unchanged from the preceding 60-case component;
its full wrappers were not rerun for the added test/runner workset.

## Remaining scope

A complete production joint activation API, relocation/rebinding of the three
local metadata journals, authenticated normal route publication, the complete SDK policy matrix,
physical storage qualification and the full candidate profiles remain required.
The historical archive-read and WebKit faults remain unconfirmed. This component
is not public V1 distribution, feature parity or release approval. All thirteen
V1 gates remain open; Rust, normal Wasm and package versions are unchanged.
