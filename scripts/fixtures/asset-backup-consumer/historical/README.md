# First raster archive producer fixture

`archive.base64` encodes 1,371 exact bytes emitted by `RichAssetStore.exportBackup()`
from commit `6575420fd979461aec79a06098aca4339136d3b2`, the first Raster Asset
Archive V1 source. The decoded byte SHA-256 is
`ff299e7314f19cf63a8c6cd96678fa73743089ee4cb92646145a52fec963f205`.

The capture bundles the original asset store directly and runs it in Chromium
with real IndexedDB, raster decoding and Web Crypto. Four fixed one-pixel PNGs
give distinct payload hashes. Public asset operations leave one pending, one
cancelled after three epoch changes, one failed after one attempt, and one
uploaded after one attempt with the fixed `first-producer/receipt` value. The
capture supplies the fixture upload outcomes and makes no network uploads.

Check out that commit in a separate clean directory and set `producer` to its
absolute path. From the current repository with the locked JavaScript tools and
Playwright Chromium installed, run:

```sh
fixture=scripts/fixtures/asset-backup-consumer/historical
node "$fixture/capture.mjs" "$producer" | cmp - "$fixture/archive.base64"
```

The current independent installed browser check uses the pure archive reader
and public asset store, then verifies exact framed bytes on cold reopen. Its
negative controls refuse a missing preserve policy
and a different valid PNG substituted under the original asset identity.
