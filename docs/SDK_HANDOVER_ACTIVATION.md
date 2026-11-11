# SDK activation of an inactive sealed successor

The host seals the genuine source and retains its complete server backup before
restoring the successor. It prepares a durable Native activation checkpoint and
an independently authenticated activation control. The successor remains
inactive. Its Native, provider and sealed-path read controls can verify the
current source without starting ordinary client service.

The private metadata coordinator adds three explicit operations:

- `prepareNativeActivationAcrossHandover` takes the genuine pre-provisioned
  activation host, complete recovery inputs and sealed path. It captures all
  original packets, Native/server files, rasters and current reconciliation
  under one real source reservation. It checks the actual path around capture
  and retention. The independent `retainChoice` hook receives only inert data
  and finishes before absent-only intent creation. No activation is requested.
- `readNativeHandoverActivationIntent` reopens the exact existing intent and
  verifies its complete data against the current local metadata binding. This
  read grants no service and sends no activation request.
- `commitNativeActivationAcrossHandover` requires the same selected genuine
  path, a genuine historical Native inspection host and a fresh approval. It
  reauthenticates the path and repeats exact client, metadata, packet, raster
  and Native inspection around approval. It records `request-started` before
  sending the authenticated Native request. A complete receipt is retained only
  after the actual selected path remains valid.

Provisioning happens before preparation. There is no resource-producing
provisioning callback inside the room reservation. The existing original
activation methods and formats keep their meanings.

Private controller ports expose their own and nested controller lifetimes and
synchronous guards. Closing any selected Native, delivery, path or activation
controller ends a pending data hook or approval. Late callback outcomes stay
observed. The actual request receives the same cancellation signal and drains
under its existing rules. Closing a checker does not retire the Native service
or acknowledge any client queue.

Commit-time inspection uses an explicit handover admission. The ordinary
inspector retains its exact restore-origin rule. A genuine authenticated path
must contain the original catalog origin and current cut in order, and its
selected current provider must equal the recorded provider. This admission is
valid only during that finite inspection; detached or copied values and expired
visits cannot reuse it. Native packet, metadata, raster and provider inspection
still run in full.

Every failure after the recorded attempt conservatively remains
`activation_outcome_unknown`. There is no automatic retry or rollback. Explicit
retry reopens all bytes and requires fresh path authentication, actual inspection
and approval. The retained Native control returns the same receipt and actual
epoch on repeated commit. Original Pending/cache facts, offline operations,
metadata packets, receipts and Undo/Redo stay separate from activation.

Run `node scripts/build-handover-native-activation.mjs` to build the separate
`native_handover_activation_sdk_functional` fixture. It uses real public Rust
handover, recovery, provider and activation APIs. Its private IPC prepares and
observes controls; it cannot commit the target. A pre-commit service request
refuses. Only authenticated HTTP obtains the real active router.

The publication fixture selects an explicit handover mode that holds the normal
listener in the existing Rust publication owner. Native activation installs the
epoch, then the separately authenticated publication request starts the normal
routes. The test reads the normal health route before observing publication via
fixture IPC. It retains the complete handover choice and publication selection
as an association, drops the first successful reply, retries the same pin and
checks the actual durable deployment. A different pin is refused.

Run `node --test scripts/native-handover-activation-host.test.mjs` for the Native
activation boundary and `node --test scripts/native-handover-publication-host.test.mjs`
for the authenticated listener boundary. Run
`node --test scripts/native-handover-activation-coordinated.test.mjs` for seven
cold SDK owners, fourteen retained offline document and comment lanes, complete
handover intent bytes, lost activation and publication replies, normal protocol
delivery, provider reconciliation and future Undo/Redo.
`node scripts/check-handover-native-activation-installed.mjs` runs these workflows
and the controller and intent checks from independent offline package archives.

These fixtures use controlled Node IndexedDB, locks and image decoding. The
publication association binds the actual Native service and listener to the
retained choice. Whole-room activation still needs replacement owner promotion
and metadata continuation before that publication request. Process-crash
recovery, the remaining policy combinations and V1 release checks remain open.
