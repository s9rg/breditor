# Server generation recovery control

The standalone generation host has its own authenticated operator transport.
It checks the genuine origin, current native and raster archive, participant
inventory and live provider proof without inventing a physical ancestor.
It supplies server-side inputs for complete recovery reconciliation; it does
not decide that every retained client or outbox has been reconciled.

## Native control owner

`prepare_log_generation_recovery_control` requires the actual prepared host,
same-host native and provider byte proof, current native owner authentication,
and an independently provisioned operator account configuration. Reusing any
native editor token as an operator token refuses before provider callbacks.
The control retains a digest of the native credential, never its plaintext.
No endpoint accepts that private digest as authentication.

Each control gets a fresh nonsecret instance and the exact selected native
source. The router holds a weak reference to the explicit control guard.
Dropping or closing that guard refuses subsequent requests and results from
active checks. A real blocking native worker keeps its host until it finishes;
an authenticated socket waiting for an incomplete request body holds only its
request permit, so it cannot prevent native owner closure or cold reopen.

Every request requires the configured exact Origin and fresh operator account
authentication. Two independent permits bound admitted work with no waiting
queue. Wrong families, sources, instances, unknown fields, excessive complete
bodies and invalid cursor or range spellings refuse explicitly.

## Independent requests

All four routes use POST and bounded JSON; OPTIONS handles exact-Origin
preflight. Ordinary editor constructors and physical recovery routes retain
their existing contracts.

- `/recovery/generations/v1/check` checks the selected native and provider proof.
- `/recovery/generations/v1/assets/check` resolves the union of retained native
  references, declared client asset/generation pairs and whole-upload IDs.
- `/recovery/generations/v1/accepted/read` transfers only accepted native
  document operations and a complete ordered comment page at the selected cut.
- `/recovery/generations/v1/review/authorizations/read` reads original server
  acceptance rights for explicit comment-author counter ranges.

The control family is `breditor/server-log-generation-recovery-control` revision
one. Its source has exactly origin, server and participants. Physical A/B/C
metadata and source aliases are not accepted. Asset, accepted-payload and
original-comment requests and reads have their own generation families.
Pure request hashes bind larger reads to the exact request bytes.

Asset resolution preserves the controller's already-selected server mappings
and raster metadata. A client requirement cannot retarget an immutable server
asset, including when it introduces another generation of the same opaque ID.
Absent mappings, missing binding bytes and missing whole-upload bytes remain
separate complete Pending requirements. Actual PNG, JPEG and WebP decoding and
the existing 32 MiB asset result bound remain unchanged.

Accepted transfer explicitly includes or omits the document and selects absent,
first or continuing comment pages. An enabled comment lane cannot silently be
omitted. Historical source roles describe original acceptance; the server
reader's current role never becomes a recipient's editing permission. Original
rights are wholly covered or Pending, never a partially usable role grant.
The accepted result bound is 16 MiB; original-rights results use 8 MiB.

Actual selected native and raster comparisons follow provider callbacks and
encoding. Provider, file or physical log changes cannot publish a cached cut.
Success is a point-in-time check, not a held activation reservation.

## SDK transport

`SharedServerLogGenerationRecoveryHost` opens only an independently selected
endpoint, exact source and fresh operator token callback. The SDK freezes
selections, uses explicit request deadlines, rejects redirects and cookies,
checks complete bounded UTF-8 JSON and reserves requests before callbacks.
Cancellation and cleanup failures release that reservation without publishing
a successful result. Responses cannot manufacture an authenticated host.

The recovery, delivery and ordered-path controls retain their existing
cancellation codes. A cancelled error can include `cancellationReason`.
`deadline` records an expired SDK deadline, including one from a delegated
control. `signal` records a caller or host abort that stopped the request first.
The SDK retains its configured budgets and keeps caller-provided signal reasons
private.

The SDK-private port uses the actual class brand, so replacing public selection,
check or read methods cannot provide a forged server check. It supports all four
native requests, including original comment rights. The physical-family SDK
port remains distinct. The [seven-family generation parent read](GENERATION_RECOVERY_PARENT_AVAILABILITY.md)
now joins protected histories and whole uploads to this transport. Selected
successor/execution and complete reconciliation still require their own
family-aware joins; neither a cast nor a relabeled response substitutes for them.

## Functional verification and remaining joins

Native HTTP laws exercise forty grammar, writer-transport and independent
document/comment history combinations, real image bytes, original accepted
sources, explicit Pending requirements, late file
changes, quota and native lease lifetimes. Dropping control and real host owners
allows cold operational reopen and retained offline document/comment history,
including future Undo/Redo. SDK wire laws test canonical requests, complete
responses, current authority, cancellation, reentry and private branding.

The live exported SDK probe uses a genuine standalone Rust controller, imports
accepted payloads into the actual shared Wasm runtime and compares native author
prefixes and original comment rights. Retained original client suffixes survive
accepted transfer, then document/comment Undo/Redo works under current writable
policy; a revoked recipient remains read-only. The installed check repeats the
unchanged probe and wire assertions from fresh offline npm tarballs without workspace
links, then checks public types and a production bundle.

Complete parent/client/outbox and historical-copy reconciliation, independent
generation branch unions, serving exclusion and durable whole-room activation
remain separate architectural work. Original protocols and defaults remain
unchanged. Full feature parity and all thirteen V1 release gates remain open.

## Qualification checkpoint

The [functional qualification](qualification/2026-10-28-server-generation-recovery-control.json)
records full relay suites, repeated safety laws, both old and new SDK wire
contracts and candidate-plan checks. The exported SDK and fresh installed
tarballs repeat the real native payload, original-rights and offline-history
assertions. This qualifies the standalone control transport, not complete
parent/client reconciliation or whole-room activation.
