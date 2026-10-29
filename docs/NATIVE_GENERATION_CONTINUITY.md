# Native generation handover and epoch continuity

These are opt-in native contracts, not a replacement editor protocol or a
whole-room activation decision. Existing router defaults, original archive
families, deployment header and 104-byte epoch framing keep their meanings.

## The actual live source

`router_with_log_generation_backups_and_deployment_lease` consumes the actual
generation Room, raster store, current authentication and genuine deployment
lease. It authenticates the current account, checks native ownership/profile,
and captures the complete source before returning either the router or its
private `LogGenerationServerBackupHandle`. It creates no network capture,
fencing or activation endpoint. Original-storage rooms use their existing
separate constructor; they cannot impersonate this family.

`capture(principal, token)` reauthenticates and obtains the complete actual
generation native/raster backup under the serving boundary. Physical rotations
and unreferenced raster changes are part of the selected identity even if native
edit counters do not change. A logical document clock is not a complete cut.

`seal_for_handover(principal, token, expected)` excludes serving work using the
actual exclusive deployment permit before locking the room and rasters. It
captures and compares the entire selected source, then appends and syncs a new
epoch under that same exclusion. Stale choices append nothing. The new temporary
lease is closed before exclusion releases. Old native transactions and late
upload publications refuse instead of writing through the retired epoch.

`SealedLogGenerationHandover` returns the exact complete backup and detached
previous/sealed selections: DATA, never a replacement serving lease, client ACK,
provider closure or activation permission. Client checkpoints, offline groups,
comments and queues are not changed by sealing. Cancellation cannot cancel an
already-started blocking native worker; it retains real locks until settled.

An inactive prepared recovered host must retain its original backup Arc and
generation-operation custody. This live-source constructor does not adopt that
host or authorize discarding its original context. The internal capture/seal
path refuses joined recovery custody rather than taking an incomplete shortcut.

## Earlier clones cannot remain unfenced

All Host clones share one private deployment slot. A clone taken while the slot
is inactive cannot retain a copied `None` after another clone attaches an epoch.
The slot's read guard spans real native work, fsync and epoch postchecks; its
one-time writer waits for admitted unfenced work. Attachment validates the actual
native/raster binding under the genuine serving permit. It consumes the real
lease, cannot refresh a retired host and never falls back to unfenced operation
after uncertainty or poisoning. This private prerequisite exposes no recovered
host activation endpoint.

## Observed history cannot be forgotten

The former implementation could revive an old lease if a valid earlier ledger
prefix reappeared at the same inode. Checking the new lease first happened to
retire the authority and hid this ordering bug. Another variant forgot an old
lease's observed replacement; a larger valid counter could also hide a divergent
previously witnessed prefix.

Each authority now remembers its observed ordinal and exact frame digest.
Operator reads, claims and cold opens retain that prefix while validating the
complete bounded lineage. Hot serving checks read its fixed-size witnessed
anchor as well as the current lease: they do not replay a growing ledger on
each edit. Claim reads back its exact committed frame before minting the lease.
Observing a replacement permanently retires that lease and all its clones;
the newer complete head is replayed once on retirement, not every keystroke.
Uncertain or divergent custody fails closed without repair or truncation.

## Independently retained cold selection

`RoomDeploymentAuthority::open_at_least(path, selection)` is additive. Persist
the selection independently of the room/archive and the authority being opened.
Cold opening validates its canonical family, generation and nonce and requires
the full current chain to retain that exact selection. Later valid epochs are
allowed; a shorter prefix or different retained nonce refuses without changing
bytes. Opening remembers the actual newer head, not only the supplied minimum.
It grants authority custody only: a fresh exact CAS claim is still required.
Old identity-only `open` keeps its original meaning.

No local file API can detect omitted history if every independent witness is
rolled back with it. Supplying an older pin does not prove that no later work
existed. Epoch continuity is not whole-room cut continuity or account authority.
The reference file-lock backend still requires cooperating processes on the same
supported Unix filesystem; it is not a portable consensus service.

## Verification and remaining work

Regression laws reproduce the old-lease-first and observed-revocation failures,
stale CAS and larger valid divergent prefixes using actual disposable ledgers.
They check real durable native write exclusion, cold selection serialization,
wrong/malformed pins, valid later advancement and shared-clone exclusion.
Public-only tests cover all ten grammar/transport modes with both server history
lanes segmented, exact offline document/comment retries, both native Undo/Redo
lanes, complete raster bytes and inactive restore. This selected public workflow
is not a new exhaustive Cartesian proof of every history-family combination.

The separate [durable source intent](DURABLE_GENERATION_SOURCE_HANDOVER.md) now
retains source DATA before a source-bound epoch append. Whole-room activation still needs
complete current provider/client reconciliation, historical outbox settlement,
explicit local-comment adoption, recovered-host original custody and an
authenticated once-only replacement transition. The original in-memory seal keeps its original scope; its result alone does
not solve a coordinator crash after fencing. No V1 gate closes on these APIs.
The [main-tree qualification](qualification/2026-10-28-native-generation-continuity.json)
records 509 server-feature tests (334 unit tests, every public integration
target and 29 doctests), 273 no-server tests and 184 plan/verifier laws,
all without skips. Both all-target strict Clippy modes, formatting and Rustdoc
pass. The exact pre-metadata source and complete logs are retained separately;
this is not a whole-plan or V1 release qualification.
