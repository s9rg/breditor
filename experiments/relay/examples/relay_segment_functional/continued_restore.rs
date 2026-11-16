//! Exercise unserved reconstruction and cold inspection using original SDK files.
use super::{Result, continued_capture, read, storage};
use breditor_collab_relay::{
    RelaySegmentClientJournal, RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive,
    RelaySegmentClientUploadPin,
    assets::asset_id,
    server::{ContinuedRasterRoomClientArchives, RecoveredContinuedRasterRoomIdentity},
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
    additional: Vec<Companion>,
    #[serde(default)]
    staged: Vec<String>,
    #[serde(default)]
    approve: bool,
    #[serde(default)]
    rollover: bool,
    generation: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Companion {
    journal: RelaySegmentClientJournalPin,
    uploads: RelaySegmentClientUploadPin,
}

pub(super) fn run(parent: &Path, reopen: bool) -> Result {
    let original: Originals =
        serde_json::from_str(&read(&parent.join("originals.json"), 32 * 1024)?)?;
    let (files, selected) = continued_capture::open(parent)?;
    let destination = parent.join("prepared");
    let local = parent.join("prepared-selection.json");
    let mut target = if reopen {
        let pin: RecoveredContinuedRasterRoomIdentity = serde_json::from_str(&read(&local, 4096)?)?;
        files.reopen(&destination, &pin)?
    } else {
        let mut journals = vec![RelaySegmentClientJournal::open(
            File::open(parent.join("original.journal"))?,
            original.journal.clone(),
        )?];
        let mut uploads = vec![RelaySegmentClientUploadArchive::open(
            File::open(parent.join("original.uploads"))?,
            original.uploads.clone(),
        )?];
        for (index, companion) in original.additional.iter().enumerate() {
            journals.push(RelaySegmentClientJournal::open(
                File::open(parent.join(format!("companion-{index}.journal")))?,
                companion.journal.clone(),
            )?);
            uploads.push(RelaySegmentClientUploadArchive::open(
                File::open(parent.join(format!("companion-{index}.uploads")))?,
                companion.uploads.clone(),
            )?);
        }
        let inputs = ContinuedRasterRoomClientArchives {
            journals: &journals,
            uploads: &uploads,
            alternatives: &[],
        };
        let generation = original.generation.as_deref().unwrap_or("continued-portable-next");
        let target = if original.rollover {
            files.restore_rolling_raster_generation(
                &destination,
                generation,
                inputs,
                &original.staged,
            )?
        } else if original.staged.is_empty() {
            files.restore(&destination, generation, inputs)?
        } else {
            files.restore_staging_client_rasters(
                &destination,
                generation,
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
    assert_eq!(target.rolled_raster_generation(), original.rollover);
    assert!(target.asset(&original.deferred)?.is_none());
    let staged_bytes = target.asset(&original.queued)?.map(|asset| asset.bytes);
    assert_eq!(staged_bytes.is_some(), original.staged.contains(&original.queued));
    let wanted_journals = std::iter::once(&original.journal)
        .chain(original.additional.iter().map(|companion| &companion.journal));
    assert!(target.client_journal_pins(false)?.iter().eq(wanted_journals));
    assert!(target.client_journal_pins(true)?.is_empty());
    let wanted_uploads = std::iter::once(&original.uploads)
        .chain(original.additional.iter().map(|companion| &companion.uploads));
    assert!(target.client_upload_pins()?.iter().eq(wanted_uploads));
    let mut journal = Vec::new();
    assert!(target.copy_client_archive(&original.journal, false, &mut journal)?);
    let uploads = target
        .open_client_upload_archive(&original.uploads.writer)?
        .ok_or("captured queue unavailable")?;
    let mut queue = Vec::new();
    io::copy(&mut uploads.take(original.uploads.bytes + 1), &mut queue)?;
    let reconciliation =
        super::continued_reconcile::verify(parent, &mut target, original.approve && !reopen)?;
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
