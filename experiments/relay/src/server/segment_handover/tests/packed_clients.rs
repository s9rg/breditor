//! A cold worker restores exact client-native journals under a low open-file limit.
use super::{POLICY, Source, TestResult};
use crate::{
    Error, RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily,
    RelaySegmentJournalOwner,
    log::generations::GenerationDirectory,
    server::{RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup},
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command as Process,
};

const JOURNALS: usize = 52;
const TOO_MANY_OPEN_FILES: i32 = 24;

#[tokio::test]
async fn packed_clients_restore_original_journals_under_a_small_file_limit() -> TestResult {
    let source = Source::open()?;
    let (mut authors, frame) = source
        .handle
        .host
        .transaction(|room| {
            let authors =
                (0..JOURNALS).map(|_| room.register("owner")).collect::<crate::Result<Vec<_>>>()?;
            Ok((authors, room.catchup("owner")?))
        })
        .await?;
    authors.sort_by(|left, right| left.lease.writer.cmp(&right.lease.writer));
    let split = source.parent.join("split-clients");
    let mut selection =
        source.handle.capture_packed_portable_relay_segment("owner", &source.token, &split)?;
    let journals = GenerationDirectory::create(&split.join("selected-journals"))?;
    for (index, author) in authors.into_iter().enumerate() {
        let writer = author.lease.writer;
        let mut client = source.profile.join_frame("room".into(), writer.clone(), &frame)?;
        assert!(client.apply(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: format!("offline writer {writer} "),
        })])?);
        if index % 2 == 0 {
            assert!(client.undo()?);
        }
        let contents = client.checkpoint()?;
        let file = journals.create_file(&format!("{index}.journal"), contents.as_bytes())?;
        file.sync_all()?;
        selection.retained.selected_journals.push(RelaySegmentClientJournalPin {
            owner: RelaySegmentJournalOwner::Document {
                writer,
                family: RelaySegmentDocumentJournalFamily::Original,
            },
            bytes: contents.len() as u64,
            sha256: Sha256::digest(contents.as_bytes()).into(),
        });
    }
    drop(journals);
    RelaySegmentRetainedBackup::open_portable(&split, &selection)?;
    fs::write(source.parent.join("selected-clients.json"), serde_json::to_vec(&selection)?)?;
    fs::write(source.parent.join("accepted-catchup"), frame)?;
    let worker = Process::new("/bin/sh")
        .args(["-c", "ulimit -n 48 && exec \"$@\"", "sh"])
        .arg(std::env::current_exe()?)
        .args([
            "--exact",
            "server::segment_handover::tests::packed_clients::cold_client_worker",
            "--nocapture",
        ])
        .env("BREDITOR_PACKED_CLIENTS_FIXTURE", &source.parent)
        .output()?;
    assert!(
        worker.status.success(),
        "cold client restore: {} {}",
        String::from_utf8_lossy(&worker.stdout),
        String::from_utf8_lossy(&worker.stderr),
    );
    check_bad_pack(&source.parent.join("packed-clients"), &selection)
}

#[test]
fn cold_client_worker() -> TestResult {
    let Some(root) = std::env::var_os("BREDITOR_PACKED_CLIENTS_FIXTURE") else {
        return Ok(());
    };
    let root = PathBuf::from(root);
    let selection: RelaySegmentPortableBackupIdentity =
        serde_json::from_slice(&fs::read(root.join("selected-clients.json"))?)?;
    let split = root.join("split-clients");
    assert!(matches!(
        RelaySegmentRetainedBackup::open_portable(&split, &selection),
        Err(Error::Io(error)) if error.raw_os_error() == Some(TOO_MANY_OPEN_FILES),
    ));
    let packed = root.join("packed-clients");
    let first_input = split.join("selected-journals/0.journal");
    let original_input = fs::read(&first_input)?;
    RelaySegmentRetainedBackup::copy_portable_fully_packed(&split, &packed, &selection)?;
    assert_eq!(fs::read(&first_input)?, original_input);
    assert!(!split.join("client-inputs.bin").exists());
    fs::rename(split, root.join("parked-split-clients"))?;
    let packed_copy = root.join("packed-client-copy");
    RelaySegmentRetainedBackup::copy_portable_fully_packed(&packed, &packed_copy, &selection)?;
    assert_eq!(
        fs::read(packed.join("client-inputs.bin"))?,
        fs::read(packed_copy.join("client-inputs.bin"))?
    );

    let bundle = RelaySegmentRetainedBackup::open_portable(&packed_copy, &selection)?;
    let path = root.join("recovered-packed-clients");
    let target = bundle.restore(&path, "restored-clients", POLICY)?;
    assert_eq!(
        target.components().0.catchup("owner")?,
        fs::read_to_string(root.join("accepted-catchup"))?
    );
    drop(target);
    let target = bundle.backup().reopen(&path, POLICY)?;
    for pin in &selection.retained.selected_journals {
        let contents = target.read_client_journal(pin)?.ok_or("missing recovered journal")?;
        assert_eq!(<[u8; 32]>::from(Sha256::digest(contents.as_bytes())), pin.sha256);
    }
    Ok(())
}

fn check_bad_pack(packed: &Path, selection: &RelaySegmentPortableBackupIdentity) -> TestResult {
    let file = packed.join("client-inputs.bin");
    let original = fs::read(&file)?;
    let mut changed = original.clone();
    changed[8] ^= 1;
    let mut version = original.clone();
    version[6] ^= 1;
    let mut trailing = original.clone();
    trailing.push(0);
    for invalid in [&changed[..], &version, &trailing, &original[..original.len() - 1]] {
        fs::write(&file, invalid)?;
        assert!(RelaySegmentRetainedBackup::open_portable(packed, selection).is_err());
    }
    fs::write(&file, original)?;
    fs::create_dir(packed.join("selected-journals"))?;
    assert!(matches!(
        RelaySegmentRetainedBackup::open_portable(packed, selection),
        Err(Error::Contract("portable backup mixes client archive layouts")),
    ));
    Ok(())
}
