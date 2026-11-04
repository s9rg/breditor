# Native restart during joint activation

The Native process boundary is qualified separately from the client-side joint
coordinator. A restart cannot recreate an old HTTP control, account token,
publication receipt, or live serving lease from saved JSON.

`native_joint_process_recovery_functional` is a separate, opt-in test executable.
It uses the existing public Rust custody, checkpoint, authentication, protected
registration, activation and publication implementations. It adds no product
HTTP route, public SDK export, default protocol, or new permission from a receipt.
The original publication and process-recovery executables retain their meanings.

## Selected state and restart rules

The parent retains the exact raw checkpoint identity and its SHA-256 before
killing its own actual child with `SIGKILL` and waiting for exit. Raw filesystem
witnesses remain bytes across JavaScript; they are decoded and validated in Rust.
The bootstrap also selects the original sealed source, complete observed Native
backups, the original complete predecessor, the actual operational directory,
current deployment authority and every protected document/comment registration.
Private account/registration credentials travel through bounded private stdin,
never through public qualification files.

A prepared checkpoint reopens the exact pending epoch with fresh controls.
A committed checkpoint requires a fresh child checkpoint and next epoch. Rust
checks that this child's parent digest is the exact selected committed identity.
Every reopen reacquires the same operational target and independently verifies
all fourteen protected streams with fresh account authentication. Actual target
advancement beyond the selected checkpoint, divergent data, damaged archives or
an incompatible current authority refuse rather than restoring an older backup.

Both paths provision fresh activation and publication controls. Normal editing
routes stay unavailable until an authenticated activation request and then a
separate authenticated publication request succeed. The private observer only
reports actual published custody; it cannot start serving. A lost successful
reply remains uncertain and may be retried against that same actual owner.
A different publication binding is refused once the owner has published.

Repeated process deaths use a separately named private bootstrap format,
`breditor/private-native-joint-process-recovery`. It can select both the original
restart checkpoint and the child produced by an earlier committed reopen.
The original private bootstrap still accepts its original namespace only.
Checkpoint references are DATA with read-back byte counts and hashes; they grant
neither an actor nor service authority.

## Reproducible qualification

Run with the repository's qualified Node and Rust toolchains:

```sh
node scripts/build-native-joint-process.mjs
node scripts/check-native-joint-process.mjs
```

The builder uses its own `target/native-joint-process-native` directory with a
3 GiB budget. It builds the new executable and both original executables for
compatibility checks. It checks protected historical binaries and normal Wasm
bytes before/after. The checker requires the exact frozen build source and
copies the exact executables into bounded test roots.

Nine cases run against source and again against independently packed/installed
packages. Test scripts differ only by verified, reversible installed-module
locations. The checks include:

- Three crashes each from initially prepared, committed and published states,
  including later pending/committed restarts and actual successful lost replies.
- Exact Native backup bytes, unchanged original checkpoint/intent bytes, the
  original selected complete predecessor, fresh account tokens, and all fourteen
  original protected registration credentials.
- Raster reads through the fresh recovery control before activation, refusal of
  old controls/tokens, pending snapshot restrictions, and publication retry.
- Damaged prepared/committed checkpoints, unchanged deployment authority on
  refusal, preservation of the damaged evidence, and path-escape refusal.
- The original publication workflow plus the existing direct process-recovery
  and failed-boot cases, using the newly built original executables.

This is controlled Native/SDK transport qualification. It does not simulate a
physical browser, prove client offline Undo/Redo preservation across this new
process association, or close any V1 release gate.

## Remaining integration boundary

`ColdJointRoomActivationAttempt.confirmNative` still deliberately accepts only
its original exact Native control selection. A restarted process needs a new
independently selected association. The original joint intent, Native intent,
metadata origin and any existing metadata destinations must remain immutable.
Fresh controls can change both the activation instance and metadata delivery
selection. Client reassociation therefore needs an explicit new descriptor and
continuation destinations, complete original-source inspection, fresh decisions,
and functional local-history/offline/metadata tests before exposure to a caller.
Do not relax the exact-selection guard or retarget an old host to bypass this.
