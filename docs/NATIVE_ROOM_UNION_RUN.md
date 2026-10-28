# Native room union recovery runs

The mixed room recovery workflow has its own execution attempt and progress journal. It retains the full [mixed preparation](NATIVE_ROOM_UNION.md) and [two upload decision edges](NATIVE_ROOM_UNION_EXECUTION.md) through actor-preserving warm recovery or fresh-actor cold recovery. Neither recovery path authenticates a server or turns stored progress into permission.

These contracts remain SDK-private. The existing exact-preparation, execution and run formats retain their original meanings and defaults. A mixed manifest is never projected into an old exact archive or run identity.

## Identity and admission

A run names one distinct journal and the exact complete mixed execution choice. Its execution selection remains bytes plus manifestSha256, with recursive semantic admission of every native and upload component. Journal events separately hash the normalized complete run identity and each event. A journal head cannot stand in for the execution file or a genuine actor owner.

Every executable target policy is independently chosen by the current host. Original-role windows are supplied separately by that host for every read, rather than recovered as grants from saved files. Run, preparation, nested union, catalog, operation, adoption, approval, participant and selected-upload namespaces must be disjoint from their known source roles. Read scopes pin storage and lock contexts before callbacks. A non-void or asynchronous permission check is not synchronous access authority.

The journal has two tables, one exact intent and a contiguous append-only event chain. Creation is absent-only; resume is existing-only. Reads count both tables before bounded loading. Append requires a store-owned witness and compares the entire current metadata cut in the write transaction. Stale or copied reports, modified hashes, extra rows and unknown schema refuse without repair or overwrite.

## Warm actor custody

NativeRoomUnionExecutionAttempt.begin returns synchronously, before I/O, retirement or target creation. It reserves the genuine current owner against competing retirement and closure. The attempt is therefore reachable before any actor can move.

Run re-admits the immutable execution and complete target catalog, opens START and obtains a fresh affirmative decision. Actual retirement uses the genuine one-shot native and packet witness and the existing reserved original-owner route. Failed old cleanup retains all authors in that same canonical owner; retry must finish that cleanup before taking the actual stopped cohort. A saved retired event supplies none of this custody.

The attempt keeps every target catalog, root and upload-adoption handle before a later await can reject. Target construction records its start before opening an absent destination. Resume still admits every actual target through its concrete recovery journal and verifies the exact catalog, native histories, packets and complete adoption bases. A started event alone never permits an occupied foreign destination to be overwritten. Cleanup drains failed pending openings before releasing actor escrow.

## Cold actor acquisition

ColdNativeRoomUnionExecutionAttempt.resume accepts the original root policy, mixed run identity, fresh readers and a separate original-upload custody namespace. It accepts no surviving editor, owner, stopped flag or cohort. Complete source and target names and the same room, writer and comment-author membership are admitted before acquiring fresh actors.

Cold inspection opens the existing run, acquires the whole author cohort and captures the actual original root and selected uploads. The recovered original must be conserved by the captured source leg of the mixed preparation: exact native continuation, complete packet variants and both original and selected upload stores. The foreign retained leg is independently re-admitted by the mixed archive. It does not excuse uncaptured local edits, decisions, attempts or receipts. Unknown original work requires a fresh reconciliation; it is never silently reset to the saved output.

Pending original recovery is separate from inspection. repairOriginal requires a fresh affirmative decision scoped to the original root and opens no replacement target. Run then binds a fresh preview to the actual original cut and current journal head, obtains approval and captures again. Only after equality holds does it close the original native parents, keeping the actual author cohort and original upload custody until target recovery and handoff finish.

Cold targets borrow the newly acquired authors through the same concrete target recovery route as warm targets. Original document/comment Redo and compatible foreign contributions come from the admitted mixed output, including captured work newer than an acknowledged source save. A historical retired row is not fabricated retirement of these new original handles.

## Handoff preparation and observation

Promotion is a separate fresh joint decision over the actual complete native, packet and selected-upload cut and current run head. The existing ordinary approval file is retained before the final transfer. A handoff-prepared event binds that decision head, the canonical approval bytes and SHA-256, and the complete retained approval file selection supplied by the actual transfer barrier. This event records preparation, not a completed transfer.

The common native, asset and actor barrier stages the actual successor in a recipient already owned by the attempt, then activates it synchronously with the whole cohort transfer. Only an actual current recipient can authorize recording handoff-observed. Both events bind the same handoff reference; observation is terminal in that journal. Observation means local transfer was seen, not authenticated serving or completed original cleanup.

If the observation write aborts, complete rechecks the live recipient and appends the missing observation. If its commit acknowledgement is lost, complete rereads the exact chain and recognizes the already-committed observation. It never repeats the transfer or asks a saved marker to recreate the successor. takeOwner remains unavailable until journal and original cleanup finish; a cleanup failure leaves actual ownership reachable for the same attempt to retry or close.

The selected owner has its own post-handoff policy. Taking it closes the finite read job without tying future editing or selected-upload access to that ended scope. Public run reports expose no partial root, actor-taking method or serving activation. Reopening the selected output requires independently chosen policies for that output catalog, including flat-local read policies where snapshot input was reconstructed as flat-local output. Reusing the original snapshot policy correctly refuses with catalog_policy.

## Bounds and remaining work

The distinct run metadata budget is 64 MiB and 4096 events. The mixed execution aggregate remains 32 GiB with a 32 MiB header; native components keep the existing 1 GiB digest ceiling and 1 MiB chunks. These admission ceilings do not establish maximum-size memory, quota or latency qualification. Sustained histories and long-running journals still need a lifecycle that preserves outstanding offline edits and future Undo.

A cold run ending at handoff-prepared must re-admit actual original and target storage with fresh authors and approval. A terminal handoff-observed record deliberately refuses fresh execution of those mutable targets. readNativeRoomUnionRunHandoff freshly admits the execution, event chain and actual retained approval file, reconstructing a complete selected-room basis from its literal native cut and selected upload bases. The returned data can enter ordinary selected-room recovery with fresh actors, actual-target checks and approval; it is not a rerun of an already-observed replacement or a recreated permission grant. Physical process or power-loss qualification remains separate from controlled storage interruption tests.

Original-role network authentication, complete provider/client reconciliation, independent comment and server-log generation lifecycle and authenticated whole-room activation remain required. Union mutation for other operational families, unknown own-author suffixes, incomparable sealed histories and remaining feature parity are not resolved by this local coordinator. All thirteen V1 gates remain open.

Reproducible focused checks are scripts/check-native-room-union-run-sdk.mjs and scripts/check-native-room-union-run-installed.mjs. They cover the previous union laws and the distinct warm, cold and journal contracts, using pinned real Rust/Wasm with controlled IndexedDB, locks and raster presentation. The installed checks exercise actual offline packages and a production bundle without workspace links.

## Functional qualification

The [focused qualification](qualification/2026-10-27-native-room-union-run.json) records 149 passing tests each from source, offline-installed packages and an actual production bundle, with 26 strict consumer fixtures. Five existing ordinary-promotion regressions also pass across all four independent document/comment history pairs and actual approval-storage and cleanup failures. The native binary is unchanged. The controlled interruptions and full handle teardown do not close any V1 gate or establish physical crash durability or authenticated serving.
