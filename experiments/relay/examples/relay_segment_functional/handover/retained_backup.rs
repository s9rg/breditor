//! Restore the retained originals directly from their new portable bundle.
use super::{POLICY, Result, read, storage};
use crate::original_capture;
use breditor_collab_relay::{
    Error, RelaySegmentClientJournalPin, RelaySegmentClientUploadPin, RelaySegmentJournalOwner,
    server::{RelaySegmentRetainedBackup, RelaySegmentRetainedBackupIdentity, ServerBackupHandle},
};
use std::{fs, io::Read, path::Path};

pub(super) fn verify(
    parent: &Path,
    handle: &ServerBackupHandle,
    token: &str,
    standalone: &RelaySegmentClientUploadPin,
) -> Result<RelaySegmentRetainedBackupIdentity> {
    let capture = parent.join("retained-room-backup");
    let identity_path = parent.join("retained-room-backup.json");
    let captured = handle.capture_relay_segment_with_retained_clients("owner", token, &capture)?;
    storage::write_new(&identity_path, &serde_json::to_vec(&captured)?)?;
    let expected: RelaySegmentRetainedBackupIdentity =
        serde_json::from_str(&read(&identity_path, 128 * 1024)?)?;
    assert_eq!(expected, captured);
    let live = parent.join("restored");
    let read_journals = |name: &str| -> Result<Vec<RelaySegmentClientJournalPin>> {
        Ok(serde_json::from_str(&read(&live.join(name).join("manifest.json"), 128 * 1024)?)?)
    };
    assert_eq!(expected.selected_journals, read_journals("client-journals")?);
    assert_eq!(expected.alternate_journals, read_journals("client-alternatives")?);
    assert_eq!(expected.standalone_uploads, std::slice::from_ref(standalone));
    let uploads: Vec<RelaySegmentClientUploadPin> =
        serde_json::from_str(&read(&live.join("client-uploads/manifest.json"), 128 * 1024)?)?;
    let embedded = expected
        .selected_journals
        .iter()
        .find_map(|pin| match &pin.owner {
            RelaySegmentJournalOwner::IndependentParticipant { writer, .. } => Some(writer),
            _ => None,
        })
        .ok_or("fixture embedded upload writer")?;
    assert_eq!(uploads.len(), 2);
    assert!(uploads.iter().any(|pin| &pin.writer == embedded));

    let (prior, _) = original_capture(parent)?;
    let mut incomplete = expected.clone();
    incomplete.alternate_journals.clear();
    assert!(matches!(
        RelaySegmentRetainedBackup::open(&capture, Some(prior.clone()), &incomplete),
        Err(Error::Contract("relay segment restore omitted a recovered discussion source"))
    ));
    let selected = capture.join("selected-journals/0.journal");
    let missing = capture.join("selected-journals/parked.journal");
    fs::rename(&selected, &missing)?;
    let refused = RelaySegmentRetainedBackup::open(&capture, Some(prior.clone()), &expected);
    fs::rename(&missing, &selected)?;
    assert!(
        matches!(refused, Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound)
    );

    let bundle = RelaySegmentRetainedBackup::open(&capture, Some(prior), &expected)?;
    let destination = parent.join("retained-room-restored");
    let restored = bundle.restore(&destination, "retained-room-restored", POLICY)?;
    drop(restored);
    let reopened = bundle.backup().reopen(&destination, POLICY)?;
    assert_eq!(reopened.client_alternate_pins()?, expected.alternate_journals);
    assert_eq!(reopened.client_upload_pins()?, Some(uploads.clone()));
    for (index, pin) in expected.selected_journals.iter().enumerate() {
        let mut bytes = Vec::new();
        assert!(reopened.copy_client_archive(pin, &mut bytes)?);
        assert_eq!(
            bytes,
            fs::read(capture.join("selected-journals").join(format!("{index}.journal")))?
        );
    }
    for (index, pin) in expected.alternate_journals.iter().enumerate() {
        let mut bytes = Vec::new();
        assert!(reopened.copy_client_alternative(pin, &mut bytes)?);
        assert_eq!(
            bytes,
            fs::read(capture.join("alternate-journals").join(format!("{index}.participant")))?
        );
    }
    for pin in &uploads {
        let mut bytes = Vec::new();
        reopened
            .open_client_upload_archive(&pin.writer)?
            .ok_or("retained original upload")?
            .read_to_end(&mut bytes)?;
        assert_eq!(
            bytes,
            fs::read(live.join("client-uploads").join(format!("{}.uploads", pin.writer)))?
        );
    }
    Ok(expected)
}
