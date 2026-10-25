# Selected room provider checks

The SDK-private selected owner can check provider availability while holding the
same actual native clients, source records, origin uploads and selected uploads.
This connects editable recovery to authenticated asset reads without treating a
local receipt or saved recovery decision as proof that an asset is available.

## Actual host and complete input set

The caller supplies a genuine independently configured
`SharedPhysicalRoomRecoveryHost`. The host must match the room catalog's
ancestor, current server and participants. Its independently selected local
origin is not rewritten to fit the catalog. Copied objects cannot pass the host
or owner brand checks, and are refused before reading incoming option getters.

The owner reserves its real native and source records together with every
origin upload store and selected upload store. Seven participants therefore
contribute fourteen complete upload snapshots. Historical references come from
the existing protected native-history contracts, not from visible document text.
The requested asset set also includes every locally stored upload ID, including
unreferenced uploads and records that already carry a receipt. Conflicting local
asset metadata refuses the operation.

## Authentication and post request checks

With complete history, the genuine host authenticates the full reference and
upload set against the provider. Locally known metadata must agree with any
returned provider metadata. Missing provider assets produce a pending report;
the check does not upload bytes, settle a queue or replace a local receipt.

If historical copies remain unresolved or native history is pending, the owner
authenticates control but returns pending with no asset response. It does not
send a smaller request that could be mistaken for complete room availability.

After asynchronous provider work, the owner reads every selected queue again
and compares its whole snapshot. It also re-admits the retained stage and
intent, inherited upload custody, complete source records and native history.
Direct storage changes during network I/O therefore refuse the result. Successful
publication follows actual temporary read and store-custody cleanup, with
cancellation and owner lifetime checked after cleanup. A late close or abort
cannot publish an apparently successful availability result.

## Report boundaries and limits

`SelectedRoomProviderRead` is detached readonly point-in-time data. It retains
the control selection, approval and current-cut selections, protected history,
origin and selected upload pins, and the provider response when complete history
allowed one. It is neither an editable owner nor a provider lease, registration
coverage capability, writer grant or room activation. Package-root exports and
persisted protocol meanings remain unchanged.

The combined input is limited to 2,048 upload archives and 512 MiB; each archive,
asset store and provider request also keeps its existing limits. Complete
registered-stream reconciliation, authenticated server activation, stale-writer
fencing and sustainable history rotation remain separate architectural work.
See [selected owner recovery](SELECTED_OWNER_RECOVERY.md) for warm transfer and
cold resume, and [operational read cleanup](OPERATIONAL_READ_CLEANUP.md) for
temporary-resource ownership.
