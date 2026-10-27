# Retain native sources during journal admission

The independent local-history and delivery adapters must keep every actual
returned source reachable before journal admission can fail. A rejected open
does not prove that native writer leases have been released. Losing that source
would leave Close unable to return those leases after a cleanup failure.

## Reproduce the ownership loss

Both adapters previously held a newly constructed source only in a local helper
variable. If journal admission rejected and the source destructor then failed,
the helper rejected without returning the source. The parent still had its
journal, but could not retry the missing source destructor. An actual review
writer lease could remain borrowed even after another Close attempt.

The regression tests construct real native sources, reject admission, and fail
one actual review-writer release. They require subsequent cleanup through the
original attempt, without using a probe-owned source handle. Refusals before and
after the actual journal claim exercise both ownership states.

## Keep the opening reachable from its journal

The private journal source-opening owner is registered before the native
constructor runs. Its running Promise is published first, then construction
starts synchronously so ordinary call-time option capture remains unchanged. It retains the constructor's actual result before any
admission check. There can be only one such opening for a journal. A new open
cannot replace a source whose cleanup is still pending.

Admission remains synchronous. After it succeeds, a callback-free pointer move
returns the exact source and removes the temporary owner. No saved completion
field, reconstructed object or new public API grants source custody.

If construction or admission rejects, the opening attempts native cleanup. A
failed destructor retains the exact source and its cleanup obligation. The
journal's Close retries that cleanup before closing its own native origin,
database and lease. References disappear only after successful cleanup or the
successful source transfer. Cleanup neither invokes authority callbacks nor
replays, saves, acknowledges or deletes source data.

## Avoid recursive journal release

Native source cleanup can itself release a successfully claimed journal. While
the retained opening is executing that exact native destructor, its internal
journal-release callback defers journal closure to the outer cleanup owner.
It must not await the journal Close that is already awaiting the same source.

This condition comes from the actual running cleanup, not a serialized phase.
Ordinary admitted sources have no retained opening and keep their original
journal-release behavior. A failed release remains reachable for another Close
even when the native editor has already been disposed.

## Scope

The two existing journal helper signatures, ordinary source factories, saved
formats and public package roots remain unchanged. The restored-graph adapter
retains its separate source-opening owner described in
[completed room inspection](COMPLETE_EXISTING_ROOM_INSPECTION.md).

This repair does not provide cold continuation of a partial replacement build,
provider reconciliation, authenticated room activation or V1 feature parity.
Those operations still need complete native-history, packet and asset
preservation across their actual ownership barriers.
