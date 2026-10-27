# Canonical SDK actor transfer

The stopped-source transfer must not dispatch replaceable SDK entry points once
the first actual writer resource moves. The native sources capture paired escrow
creation before host factories or authority callbacks run. The retained root
likewise captures the real retirement preparation, readiness check and actor take
methods. Ordinary public method behavior and every stored format remain unchanged.

## Reproduced interruption

A two-writer fault-injection test replaces the private escrow class's static
creation method and throws on its second call. The earlier implementation called
that method during the whole-cohort move: the first pair moved, the second call
threw, and no whole cohort returned. After both old sources closed, the first two
global actor locks remained held. The diagnostic retained that scope explicitly
for cleanup; normal SDK code had no returned owner for it.

Capturing the original SDK constructor removes that dispatch from the cut.
Original paired, segmented paired and independent paired sources now move both
real writers without invoking the replacement. Their native checkpoints remain
unchanged, and the resulting genuine cohort retains all four locks until Close.
The single-writer helper already uses its closed canonical function path.

## Root retirement

The whole root captures NativeActorRetirement preparation and both instance
methods, rather than looking them up after the final approval callback. Replacing
the static and prototype methods at approval cannot insert a callback between
Core retirement and storing the actual cohort in the root. Complete saved recipe,
native/packet and current-authority admission still precede the cut; the real
cohort remains held through actual old-parent cleanup.

This protects the SDK's own ownership boundary from replaceable dispatch. It is
not isolation from arbitrary application JavaScript, modified platform builtins
or a mismatched native runtime. No stored state or caller object gains ownership,
and no new writer, editing permission or server grant is created by the repair.

## Remaining execution work

The [warm target route](NATIVE_ACTOR_TARGET_ROUTES.md) continues these actual actors
through staging and final native sources. The complete mutable executor must
still bind the immutable execution choice to an explicit START journal, retain
its real attempt owner before irreversible work, adopt all selected upload data
and perform the final common ownership barrier. Cold acquisition and authenticated
cross-device activation remain separate requirements. All thirteen V1 gates stay
open.
