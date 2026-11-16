//! Exercise unserved reconstruction and cold inspection using original SDK files.
use super::{Result, read, storage};
use breditor_collab_relay::{
    RelaySegmentClientJournal, RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive,
    RelaySegmentClientUploadPin,
    assets::asset_id,
    server::{
        ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity,
        ContinuedRasterRoomClientArchives, RecoveredContinuedRasterRoomIdentity,
    },
};
use serde::Deserialize;
use serde_json::json;
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Originals {
    journal: RelaySegmentClientJournalPin,
    uploads: RelaySegmentClientUploadPin,
    rasters: [String; 2],
    queued: String,
    deferred: String,
    #[serde(default)]
    staged: Vec<String>,
}

pub(super) fn run(parent: &Path, reopen: bool) -> Result {
    let selected: ContinuedRasterRoomBackupIdentity =
        serde_json::from_str(&read(&parent.join("capture-selection.json"), 32 * 1024)?)?;
    let original: Originals = serde_json::from_str(&read(&parent.join("originals.json"), 4096)?)?;
    let files = ContinuedRasterRoomBackupFiles::open(&parent.join("capture"), &selected, None)?;
    let destination = parent.join("prepared");
    let local = parent.join("prepared-selection.json");
    let mut target = if reopen {
        let pin: RecoveredContinuedRasterRoomIdentity = serde_json::from_str(&read(&local, 4096)?)?;
        files.reopen(&destination, &pin)?
    } else {
        let journal = RelaySegmentClientJournal::open(
            File::open(parent.join("original.journal"))?,
            original.journal.clone(),
        )?;
        let uploads = RelaySegmentClientUploadArchive::open(
            File::open(parent.join("original.uploads"))?,
            original.uploads.clone(),
        )?;
        let inputs = ContinuedRasterRoomClientArchives {
            journals: &[journal],
            uploads: &[uploads],
            alternatives: &[],
        };
        let target = if original.staged.is_empty() {
            files.restore(&destination, "continued-portable-next", inputs)?
        } else {
            files.restore_staging_client_rasters(
                &destination,
                "continued-portable-next",
                inputs,
                &original.staged,
            )?
        };
        storage::write_new(&local, &serde_json::to_vec(target.identity())?)?;
        File::open(parent)?.sync_all()?;
        target
    };
    let room = target.room();
    let cut = room.log_generation_descriptor("owner")?;
    assert_eq!(cut.next_sequence, selected.native.predecessor.source.records.to_string());
    assert_eq!(cut.terminal_digest, selected.native.predecessor.source.terminal_log_digest);
    let frame = room.catchup("owner")?;
    let rasters = original
        .rasters
        .iter()
        .map(|id| {
            let stored = target.asset(id)?.ok_or("captured raster unavailable")?;
            assert_eq!(asset_id(&stored.bytes), *id);
            Ok::<_, Box<dyn std::error::Error + Send + Sync>>(stored.bytes)
        })
        .collect::<Result<Vec<_>>>()?;
    assert_eq!(target.staged_rasters(), original.staged);
    assert!(target.asset(&original.deferred)?.is_none());
    let staged_bytes = target.asset(&original.queued)?.map(|asset| asset.bytes);
    assert_eq!(staged_bytes.is_some(), original.staged.contains(&original.queued));
    assert_eq!(target.client_journal_pins(false)?, [original.journal.clone()]);
    assert!(target.client_journal_pins(true)?.is_empty());
    assert_eq!(target.client_upload_pins()?, [original.uploads.clone()]);
    let mut journal = Vec::new();
    assert!(target.copy_client_archive(&original.journal, false, &mut journal)?);
    let uploads = target
        .open_client_upload_archive(&original.uploads.writer)?
        .ok_or("captured queue unavailable")?;
    let mut queue = Vec::new();
    io::copy(&mut uploads.take(original.uploads.bytes + 1), &mut queue)?;
    let reconciliation = super::continued_reconcile::verify(parent, &mut target)?;
    println!(
        "{}",
        json!({
            "kind": "prepared",
            "frame": frame,
            "rasters": rasters,
            "stagedBytes": staged_bytes,
            "journal": String::from_utf8(journal)?,
            "queue": queue,
            "reconciliation": reconciliation,
        })
    );
    Ok(())
}
