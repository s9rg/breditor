# Original review permissions in recovery

Recovery can authenticate a comment event's original permission against the actual selected native server, then prepare a compatible independent-delivery branch union on private read-only owners. Current account permissions, a saved response and an incoming checkpoint cannot supply that historical authority. Unknown offline events remain intact and pending.

The SDK composition remains private. It prepares data without acquiring authors, changing live clients, acknowledging an offline suffix, settling uploads or activating a server. The existing native union, archive, recovery and transport contracts retain their meanings and defaults.

## First durable acceptance determines original rights

Room::review_original_authorizations reads positive inclusive event ranges in one independently selected review namespace. Each range names an actor, its original account, from and through. Counters are canonical u64 decimal strings. Native validation bounds each counter before parsing or aggregate encoding, so direct native calls cannot force an oversized counter copy during request validation. Ranges are ordered by actor and then counter and cannot overlap. Neither the request nor a checkpoint chooses a role. An explicit empty range list requests no original permissions and supports document-only preparation. Native union must still reject any new peer comment without a verified window.

The native reader joins each event to its first durable acceptance and the server-verified source at that acceptance. An overlapping retransmission submitted after a permission upgrade does not upgrade rights over its already accepted prefix. Adjacent events with identical original source rights share one window; a historical role change starts another. Current revocation does not erase accepted history or restore current authoring access.

Each returned window has an exact native actor-prefix digest at its inclusive end. Rust computes that digest from the actual review session, including an end inside a network batch. JavaScript does not reconstruct events or lineage hashes. Independent document/comment generations, physical log rotation and cold replay preserve original acceptance order and attribution.

The read starts with current document-read authorization. A known actor bound to a different account refuses. Unknown actors, permanent observers and unaccepted suffixes produce explicit pending ranges. If any range is pending, the complete result contains no permission windows. No accepted prefix silently authorizes an unknown suffix. Integer ranges are never expanded by counting to a caller-supplied end; traversal visits actual retained acceptance entries.

## Separate authenticated endpoint

POST and OPTIONS at /recovery/physical/v1/review/authorizations/read use the existing genuine physical recovery controller, independently provisioned operator accounts and exact Origins. The new request family is breditor/physical-room-review-original-authorizations-request version one. It binds the complete selected controller instance and physical source, the review namespace and all requested ranges.

The response family is breditor/physical-room-review-original-authorizations-read version one, with selected-server-original-review-acceptance scope. It binds the exact source and SHA-256 of the complete request body and contains the native breditor/relay-review-original-authorizations result. It returns no editor token, resume secret, current-recipient role, writer lease or activation method.

Original continuity, asset and accepted-native request/response families remain closed. A rights response is not an expanded continuity receipt. The endpoint shares the existing two-handler quota. Authentication and Origin checks precede body reading; an incomplete body retains a request permit rather than native/provider ownership. After complete admission, the real native and raster owners are checked around the read. Provider verification and selected-source checks run again before returning, including after the final provider callback.

The native request admits at most 1024 ranges and 64 KiB of range JSON. The complete HTTP request is separately limited to 64 KiB, including its selection. Results admit at most 4096 windows and 4 MiB of complete native JSON; the separate HTTP response has an 8 MiB ceiling. These limits do not widen original native event, archive or transport budgets and are not maximum-size latency qualification.

## Fresh authentication before actual branch preparation

prepareAuthenticatedIndependentDeliveryUnion requires a genuine independently configured SharedPhysicalRoomRecoveryHost, both complete original recovery strings, a separately selected read-only factory in both lanes, fresh authority and an explicit namespace/range query. It accepts no caller-supplied authorization list. A writable recipient factory refuses before authentication requests.

The composition detaches data and factories before callbacks, admits both original recovery envelopes and requires their review bindings to match the independently selected query. The privately branded host port reserves a request before inspecting caller input, obtains fresh operator authentication, and admits the whole bounded canonical response. Public method overrides and saved responses cannot manufacture that port.

A pending native response returns pending without starting a candidate native restore. For covered rights, the composition converts each original server role into the existing native union policy vocabulary, then invokes the ordinary complete independent-delivery preparation. Native replay must verify the prefix witnesses and every incoming event's rights; omitted ranges, forged lineage and unrelated branches cannot bypass it. Both complete input strings, compatible retained stores and future document/comment Undo and Redo stay with the preparation.

After private preparation, another real host check verifies that callbacks or native restore factories did not change or close the selected server. No preparation escapes after that final check fails. Historical source rights never become a recipient's current editing policy. Saved output remains data; every new authenticated preparation repeats the network read.

## Whole room integration remains separate

This authenticates accepted original comment rights for participant preparation. It does not attest rights for events the server has never accepted, discover undeclared client copies, merge unknown own-author histories or provide a complete mixed-room warm/cold authenticated transaction. The mixed-room coordinators still require independently supplied original-role windows until this read is joined to each of their relevant boundaries.

Complete registration, native, retained-packet, historic-copy, outbox and provider closure must still be bound to one current server cut. Serving activation must exclude old accepted writes while validating that complete cut and claiming the genuine deployment authority. A point-in-time authenticated read cannot replace that boundary. All thirteen V1 gates and full feature parity remain open.

Reproducible focused commands are scripts/check-original-review-native.mjs, scripts/check-original-review-sdk.mjs and scripts/check-original-review-installed.mjs. They retain the complete prior branch/preparation and authenticated-transfer workloads alongside the new native, HTTP and SDK laws. SDK tests use actual native controls and normal Wasm with controlled Node IndexedDB, locks and raster presentation; they do not qualify a physical power-loss, browser or public deployment.

## Focused functional checkpoint

The [original permission checkpoint](qualification/2026-10-28-original-review-authorizations.json) passes 197 functional checks in each source, offline installed-package and actual production-bundle run, with 45 strict consumer type fixtures. Fresh relay suites pass 259 server-enabled and 171 no-networking tests; strict linting in both configurations, strict Rust documentation and formatting also pass. Three actual native HTTP producers were rebuilt for the same frozen source. The normal browser Wasm remains unchanged.

A before-and-after Rust regression confirms that oversized from and through counters are rejected before aggregate JSON encoding, with no native cut change. The installed harness retains assertion bodies and strict reversible location checks. This checkpoint covers accepted original permissions and private branch preparation, not complete mixed-room reconciliation or serving activation.
