# Raster bytes before native activation

Complete recovery previously downloaded missing image bodies through the normal
editing service. That creates an ordering problem after a server owner is lost:
the new owner must verify complete recovery data before activation, while normal
serving routes are not yet available.

The selected generation recovery control now supports a separate authenticated
read. It works with a genuinely held inactive host. It does not start the editing
service, resolve an unselected provider mapping, modify a cache or settle uploads.
All existing protocol formats and route limits retain their original meanings.

## Native HTTP contract

`POST /recovery/generations/v1/assets/bytes/read` uses the existing independently
configured operator principal, token, exact Origin, request quota and worker
custody. Its closed JSON request contains:

```ts
const request = {
  "format": "breditor/server-log-generation-recovery-raster-request",
  "formatVersion": 1,
  "selection": selectedControlIdentity,
  "asset": contentId
};
```

Supply the complete independently selected control identity object and a content
ID containing `sha256:` followed by 64 lowercase hexadecimal digits. A URL, opaque
mapping, alternate control instance or extra field is refused.
The request is bounded to 64 KiB. The response is canonical JSON, bounded to
16 MiB, with the selected identity, exact request SHA-256 and scope
`selected-server-stored-raster-bytes`. Its format is
`breditor/server-log-generation-recovery-raster-read`, version 1. The `raster`
field is null when that content ID is absent. Otherwise it contains the actual
stored `info` and standard padded canonical `base64` of its complete file.

Files retain the existing 10 MiB maximum and PNG/JPEG/WebP restrictions. Native
storage checks the immutable file, digest and raster metadata. Known corruption
is an error, never an absent result. Current native/source/provider checks bracket
capture and final publication. The actual serialized transaction retains source
custody; caller cancellation does not release a still-running admitted worker.

Whole-file reads keep this bounded protocol simple and avoid repeatedly checking
the complete native cut and raster store for every small range. There is no
streaming/range or cache behavior in this version.

## SDK contract

Both genuine controller classes expose `readRaster(asset, signal?)`:

- `SharedServerLogGenerationRecoveryHost` reads the selected current host.
- `SharedServerLogGenerationDeliveryRecoveryHost` brackets that read with actual
  previous/current continuation checks.

The detached SDK result replaces wire base64 with an immutable `Blob` and keeps
the selected identity, request digest, scope and raster metadata. It checks exact
canonical JSON/base64, bounded lengths, MIME, dimensions and actual content hash.
Existing recovery capture still performs its own raster decoding and complete
provider-union checks. A returned body is data, never a serving or recovery grant.

The experimental recovery-byte and complete packet-capture inputs now accept
either the existing genuine `SharedRelayAssets` transport or a genuine source/
continuation recovery controller. The latter must match the independently chosen
current control exactly. SDK-private ports reject structural copies and ignore
public prototype shadows. Existing normal account transports keep their original
behavior. Local cache and upload ACK state remain unchanged by either read path.

## Qualification scope

The component commands build a dedicated example in the monitored existing
3 GiB cache, then execute source and independent installed-package worksets:

```sh
node scripts/build-recovery-raster.mjs
node scripts/check-recovery-raster-source.mjs
node scripts/check-recovery-raster-installed.mjs
```

The functional scenario uses seven actual Native client families, fourteen upload
archive roles and three raster bodies. One body exists only on the actual server.
It stops actual serving owners, opens fresh read-only continuation controls,
captures complete recovery and packet data, inspects it through a genuine inactive
Native reader and only then explicitly commits the next native epoch through the
SDK. Future document/comment Undo/Redo is checked. IndexedDB, locks and raster
presentation are controlled Node fixtures; Rust files, HTTP, source proofs,
checkpoints and activation are genuine.

Physical server-process crash/reopen, physical browser storage durability,
production whole-room handoff, full SDK policy combinations and full candidate
profiles remain separate requirements. This capability does not establish a
historical archive-read or WebKit repair or close a V1 release gate.
