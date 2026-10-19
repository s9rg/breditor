# Client participant recovery reconciliation

The opt-in collaboration SDK reads an independently selected native server
inventory and compares it with live, re-admitted participant backups. It checks
each registered document writer and review actor against the original accepted
native prefix while preserving unacknowledged local history. A covered report
describes registered streams; it neither verifies credentials nor authorizes
room activation.

Use this after original [participant recovery](SHARED_PARTICIPANT_RECOVERY.md)
and the native [server inventory](ROOM_PARTICIPANT_INVENTORY.md) checks. The
server archive retains accepted service-author history and permissions; selected
client files retain their own pending edits and history. Neither replaces the
other.

## Select the native file independently

```ts
import {readSharedRoomParticipantInventory} from '@breditor/collaboration';

const inventory = await readSharedRoomParticipantInventory(
  nativeInventoryFile,
  trustedNativeInventoryIdentity,
  {signal}
);
```

Obtain the identity from owner-authenticated native capture and retain it
separately from incoming files. It contains the exact original room cut and
32 SHA-256 bytes, matching the Rust inventory identity. Do not derive it from an
incoming header. The SDK cannot authenticate a caller-supplied expected value or
replace native server replay and registration verification.

The reader admits at most 4 MiB of exact UTF-8 JSON. Fields, families, counters,
role vocabularies, original record bounds and canonical Rust encoding remain
closed. Account ordering follows Rust's UTF-8 order, including supplementary
characters; it is not rewritten into JavaScript's UTF-16 order. Expected values
are copied before asynchronous reads, and cancellation is checked after each
await. The SDK requires Web Crypto SHA-256.

The resulting handle and detached metadata are immutable. A copied DTO or direct
JavaScript constructor call cannot manufacture its live state. `dispose()` drops
the retained file state without closing borrowed native owners, stores or
connections. Frozen metadata and identity remain diagnostic reads after disposal;
file access and source checks do not.

## Compare genuine recovered sources

```ts
import {captureSharedAssetReferences} from '@breditor/collaboration';

const source = captureSharedAssetReferences(recoveredParticipant.sources);
try {
  await participantBackup.verifyRecovered(source, recoveredParticipant.uploads);
  const coverage = inventory.checkSources([
    {backup: participantBackup, source}
  ]);
  host.inspectRegistrationCoverage(coverage);
} finally {
  source.dispose();
  inventory.dispose();
}
```

Each pair must contain the exact admitted participant file and its current
captured native/packet sources. Canonical SDK methods enforce actual live
handles. Internal borrowed read closures call the captured facade's native
checkpoint, descriptor and clock methods; per-instance clock overrides cannot
substitute for them. The host still selects and trusts the matching native
factory. This is not runtime-binary attestation or protection from arbitrary
same-origin code.

The native document checkpoint must equal the selected record. Its compiler
fingerprint, grammar, document, writer and original account must match the
trusted inventory. Document lineage uses the explicitly selected original
transport, including its exclusive counter end; no transport is inferred or
upgraded. Review lineage retains its inclusive event end, actor, original
principal and explicit server namespace. The checks call native clock/group
readers rather than constructing a second replicated document in JavaScript.

Local document or review suffixes beyond the accepted prefix remain untouched.
An older source returns `server_ahead` as pending, not a successful match or an
instruction to overwrite it. A differing retained prefix rejects as a fork.
Matching an account label does not grant access: revoked contributions are still
checked and preserved. A permanent document observer cannot contain an authored
suffix. A review observer must retain its explicit non-authoring family and zero
authored prefix, regardless of later account permissions.

Paired local-only review history without a relay binding remains
`unbound_review`. Its events are retained; matching an empty actor clock cannot
silently bind it to a server namespace. Declared version, suggestion and revision
stores pass their original closed readers and must match the inventory's exact
bindings, participant, document writer and transport. Native service authors are
server-archive responsibilities, not invented client registrations.

## Interpret coverage without activating a room

Missing registered document or review sources remain pending. Duplicate copies of
one registered writer or actor reject without selecting or discarding a copy;
reconcile their pending work explicitly. Unknown registrations, foreign accounts,
wrong namespaces, disposed or changed sources and lookalike handles also refuse.
Checks start no network, request no account token, submit no operation, save no
record and change no lease or permission.

`registeredStreamsCovered` concerns the original registered set only. The report
is detached, serializable diagnostic data, not a native proof or a completion
capability. It does not discover undeclared databases, merge historic copies,
verify protected raw credentials, confirm current account/provider authority,
resolve every asset provider or prove that each client contains every other
server-author operation. Preserve the selected server archive and all declared
client files while those obligations remain open.

## Initialize policy before the original cut check

With a matching runtime, initialize document policy in the explicitly selected
native restore factory using
[`initializeSharedReadOnly`](INITIAL_SHARED_READ_ONLY.md). It must run before
the owner issues either observation family or transfers to the SDK. Initial
locking preserves the selected checkpoint bytes and publication counter, so
the existing exact source checks can run while document edits are denied. A
paired inactive participant also needs a fresh read-only review policy.

The initializer is one-shot and does not restore a saved permission. It cannot
change a live owner's policy without publishing, and it does not select or
upgrade a recovery family. A required missing capability must refuse rather than
fall back to writable recovery or rewrite the expected source.

## Preserve the live policy publication contract

The original post-observation `setReadOnly` behavior is unchanged. Native
checkpoints retain the publication counter but deliberately do not restore
permissions. Reapplying a different live mode advances that counter, so the
earlier exact source proof becomes stale even when visible text is unchanged.
This is intentional; do not relax byte or revision checks to hide the change.
The older verification-then-policy workflow remains covered separately.

After source verification and explicit ownership handoff, the host must recheck
current authority, apply current policy, and save its new operational checkpoint
under the activation workflow. A covered report from an older cut must not be
reused as currentness or permission proof. The
[durable room catalog](ROOM_RECOVERY_CATALOG.md) retains supplied server/client
files and stages chosen original participants privately. Undeclared source
discovery, protected credentials, current provider closure and authenticated
activation/handoff remain separate work, as does the approved cross-generation
bridge for Undo/Redo and outstanding offline edits.
