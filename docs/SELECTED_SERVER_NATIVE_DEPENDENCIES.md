# Selected server Native dependencies

An accepted proposal can refer to an operation source that every saved client
lacks. Trying the packet against each unchanged client correctly returns
Pending. Importing accepted frames into those clients would change their
histories and is not a recovery proof. This component instead reads the actual
server's complete Native causal and physical packet knowledge at a selected cut.

## Contract

Both SharedServerLogGenerationRecoveryHost and SharedPhysicalRoomRecoveryHost
expose readNativeDependencies(signal?). The continuation host
SharedServerLogGenerationDeliveryRecoveryHost brackets the current-server read
with its genuine continuation checks. The separately exported
captureSelectedServerNativeDependencies(host, signal?) captures that association
through private host ports. Public method overrides and copied JSON cannot
manufacture a live association. Internal consumers recheck the genuine source
before and after work.

The authenticated routes are /recovery/generations/v1/native-dependencies/read
and /recovery/physical/v1/native-dependencies/read. Each request has exactly
format, formatVersion: 1 and selection, using the corresponding
breditor/<family>-native-dependencies-request family. It supplies no result,
packet filter or client checkpoint. Request bodies are bounded at 64 KiB.

The closed response has format breditor/<family>-native-dependencies-read,
formatVersion: 1, the exact selection, requestSha256 (the unprefixed SHA-256 of
the original request bytes), scope
selected-server-native-causal-and-complete-physical-packet-dependencies and
native: the original complete Rust inventory. The wrapper limit is 16 MiB;
the existing Native inventory keeps its original 8 MiB/100,000-item limits.

The Native inventory source must equal the selected server Native archive.
Its sources contain original global record sequences and original version,
proposal or revision identities. They include uncommitted revision preparations;
those rows are retained source facts, never committed publications. Separate
preparations can repeat a Native ID at different sequences. A revision source
also names the original previous and derived child suggestion IDs. The SDK
preserves sequence gaps and orders opaque references by Rust UTF-8 identity
order. Parsed DATA is checked for exact fields, source, counts, canonical form,
and strictly ordered original source positions.

Ready contains the complete conservative server causal/effect references and
all complete physical retained packet references. Pending contains the exact
unresolved original packet sources and missing Native writer/counter ends.
Pending provides no ready reference prefix. Neither result proves client,
provider-byte or whole-room completeness.

The server checks actual owner, inventory, Native source and provider custody
before and after capture and again after the final asynchronous provider
callback. Source changes, stale selection, close, cancellation, wrong family,
wrong authenticated operator and malformed input refuse the read. No client
receipts, outboxes, grants, editor heads or undo stacks are updated.

## Qualification and remaining integration

The [qualification record](qualification/2026-11-01-server-native-dependencies.json)
records 30 passing source cases and the same 30 cases from independently
installed offline package archives, with strict public types. The complete Rust
server suite passed 417 cases. After a test-only helper split for the lint line
limit, all 24 affected dependency/callback cases passed and server/no-server
all-target release lint passed. The only two Rust files changed after the full
suite are explicitly recorded; production Rust and SDK code stayed identical.
Both candidate profiles require the additional build, genuine Native workflows
and installed checks. Neither complete release profile was executed.

The reproduction uses seven real saved Native readers and a separate actual
author. After the author publishes accepted operations and a proposal at the
newer source, every saved reader remains Pending. The new server read can
resolve its own complete dependencies while all seven reader stamps and
read-only status remain unchanged. These readers are diagnostic Native cores;
they are not fabricated operational recovery owners. The physical-host workflow
also uses a genuine selected controller. Strict DATA and public type tests and
an independent package consumer accompany both workflows.

This is source knowledge for the ongoing recovery implementation. The original
client-only packet reader keeps its Pending semantics. The original committed
metadata packet route still cannot transfer an inert revision Prepare as an
accepted publication. Complete original physical packet recovery, source-owned
portable inspection, Native server reconstruction, provider/client reconciliation,
independent comment/server-log generations and authenticated whole-room
activation remain required. No release profile or V1/parity completion is claimed.
