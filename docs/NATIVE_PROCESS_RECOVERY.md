# Native process loss and SDK recovery

This checkpoint exercises actual Rust process death together with the SDK's
durable coordination intent, offline work and recovery byte contracts. It uses
the existing public native recovery APIs. The process driver and private
bootstrap are qualification fixtures; production whole-room handoff remains
separate work.

## Ordering and ownership

An acknowledged native epoch commit can outlive the process that served it. If
the SDK loses that response, its original intent stays `request-started` with
no receipt. A later process must not manufacture that receipt, revive the old
control, reuse its account tokens or treat saved metadata as a serving lease.

The new process opens the independently selected sealed source, checkpoint and
actual deployment authority. It reacquires the same operational target, issues
fresh account authentication and verifies all fourteen original document/comment
registration credentials. Checkpoint status controls the next step:

- `Prepared`: authenticate the current target and create a fresh control for the
  selected checkpoint, whose planned epoch is still uncommitted.
- `Committed`: preserve that decision and prepare a new checkpoint for the next
  epoch. A fresh instance and separate explicit approval are required.
- Superseded or below the actual current epoch: refuse and require an
  independently selected latest checkpoint.

The new owner initially exposes only recovery controls. Complete SDK/native/
metadata/packet/raster data is retained and inspected before another activation.
The normal editing service resumes only after the actual native control returns
its service router and the durable authority independently reports the selected
epoch. Original queue, cache and acknowledgement meanings remain unchanged.

## Rust action boundaries

The dedicated example is `native_process_recovery_functional`. Each startup
action has a separate documented file under `native_process_recovery_host/`:

- `bootstrap.rs`: closed bounded private input; preserve full native identity
  JSON losslessly, including device/inode witnesses that JavaScript numbers
  cannot safely round-trip.
- `checkpoint.rs`: actual sealed-source/checkpoint open and current epoch check.
- `reacquire.rs`: actual target custody, fresh accounts, original protected
  registrations and a genuine prepared native control.
- `restore_ready.rs`: restore original public source metadata while keeping
  native ownership separate from data. The original A/B/C path is preserved.
- `reopen.rs`: compose startup and expose the inactive control.
- `observed.rs`: reopen the independently pinned original/current backup data;
  the complete-path check still runs through the actual native APIs.
- `state.rs`: retain real owners, requests and service tasks. Large startup
  futures are explicitly boxed rather than suppressing strict lint checks.

The private bootstrap travels over bounded parent/child stdin. Protected
registration credentials and account tokens remain private memory/IPC; they do
not enter public manifests or retained credential files. Runtime capsules are
private issued objects, not a public serialized recovery or authorization API.

## Reproduced failed-start cleanup bug

A deliberately corrupted checkpoint correctly refused cold open, but the test
driver then attempted normal shutdown of the already killed old process. That
cleanup error masked the original boot failure. The driver now records actual
old-process termination before attempting the new boot. Cleanup is repeatable
even when no fresh owner could be constructed.

The regression verifies actual `SIGKILL`, refusal of the corrupt checkpoint,
preservation of the original error and corrupt bytes, unchanged durable authority
files, closed old-owner operations and repeated successful cleanup.

## Reproducible component checks

```sh
node scripts/build-native-process-recovery.mjs
node scripts/check-native-process-recovery-source.mjs
node scripts/check-native-process-recovery-installed.mjs
```

The workset includes direct real-process recovery from both prepared and
committed checkpoints, the failed-boot regression, the full seven-client cold SDK
workflow, and the previous inactive-raster baseline. In the full workflow, a real
Rust commit response is consumed by the controlled transport, the actual child
is killed and awaited, and the SDK receives an uncertain outcome. The new
process rejects the old activation selection. A separate complete intent and
approval activate the next epoch; the old intent remains unchanged. Fourteen
offline document/comment suffixes are then delivered using the original
protocols, followed by current reconciliation and exact future Undo/Redo checks.

The installed runner packs and installs independent local SDK archives; it does
not use workspace package links. Native builds use the existing monitored 3 GiB
cache and protect historical qualified binaries and normal Wasm bytes.

## Remaining limits

Actual Rust process death is covered; local IndexedDB, locks and raster
presentation still use controlled Node fixtures. Physical browser-storage
durability, the full SDK history-policy matrix, production actor/room handoff,
normal-route publication policy, candidate CI and full parity remain open. The
runtime capsule fixture covers one coordinated server replacement; it is not a
general host-process deployment manager. The public native APIs retain their
existing checkpoint-chain contracts.

Brief CPU samples identified nested client-history validation and native replay/
hashing as significant work in one recovery phase. They are diagnostic evidence,
not a whole-run performance or typing benchmark. No live-source or post-approval
integrity check was removed to speed qualification.

This checkpoint does not establish a historical archive-read or WebKit repair,
promote a package version, or close a V1 release gate.
