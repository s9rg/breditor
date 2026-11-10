# Metadata recovery through a sealed handover

A cold client can retain its original local review and metadata journals when a
sealed successor has a different restore origin. The recovery decision binds
the complete original prepared file, saved current file and review receipt
file, actual stored revision, newly opened clients and authenticated handover
path.

Use `previewSelectedLocalReviewHandover` and
`SelectedLocalReviewDelivery.resumeAcrossHandover` inside the selected native
scope. The path must cover the original catalog cuts in order and select the
same live server archive and participant inventory. The existing preparation
and review namespaces are reopened under fresh ownership. Refusal releases the
attempt and preserves their original data. A fresh affirmative decision and a
second complete inspection create the new delivery gate.

Reopen the metadata child with `SelectedLocalMetadataDelivery.reopen` using
the original metadata bundle. Original packet strings, receipts and pending
intent are checked through their existing continuation rules.

Use `captureServerPacketReconciliationAcrossHandover` with the live delivery
host, inventory and sealed path. The server selections must agree. The read
holds the current source and metadata state while comparing all native heads,
review registrations, packet dependencies and complete provider requirements.
It checks the sealed path around this work. Its separate result family retains
the selected handover and the full current reconciliation result.

Pending offline work stays visible until original authenticated adapters deliver
it. Current reference knowledge can cover an earlier uncached version while the
original cache diagnostic remains pending. The metadata capture retains each
earlier packet and receipt.

The functional check is `node --test scripts/native-metadata-handover.test.mjs`.
The independent package check is
`node scripts/check-metadata-handover-installed.mjs`. Both use the explicitly
built `selected_suggestion_delivery_functional` fixture. Controlled Node storage,
locks and image decoding support these checks. Whole-room publication and
physical browser durability have further qualification requirements.

## Capture complete recovery bytes

`captureReconciledServerPacketRecoveryAcrossHandover` retains the selected
server and inventory, original packet bodies, verified source resolution and
raster bytes under the same source reservation. Its separate envelope records
the authenticated handover selection alongside the complete capture. It checks
the path before and after capture.

Use the live selected delivery host as the raster transport to read from the
current operator service. The server and inventory readers must select that
same current cut. The capture retains each original pending, cache and receipt
fact alongside the current reconciliation result.

Run `node --test scripts/native-metadata-handover-bytes.test.mjs` for the
complete source workflow and
`node scripts/check-handover-recovery-bytes-installed.mjs` for its independent
package workflow. The tests preserve original native state and metadata packet
records while capturing recovery bytes after delivery.
