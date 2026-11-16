//! Real cold restores under a descriptor limit below the split lineage's file count.
use super::{POLICY, TestResult, auth};
use crate::{
    Error, RelaySegmentBaseFile, Role,
    assets::AssetStore,
    room::segment_handover_test_source,
    server::{
        Authentication, RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup,
        RoomDeploymentAuthority, router_with_server_backups_and_deployment_lease,
    },
};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

const PREDECESSORS: u32 = 26;
const EMFILE: i32 = 24;

#[test]
fn compact_frame_uses_raw_bytes_when_gzip_would_grow_the_checkpoint() -> TestResult {
    use super::super::packed_native_lineage::{Encoding, write_frame};
    let source = super::Source::open()?;
    let path = source.parent.join("raw-checkpoint-frame");
    let mut output = File::create_new(&path)?;
    write_frame(
        &mut output,
        Encoding::Compressed,
        1,
        4,
        |writer| Ok(writer.write_all(b"a")?),
        |writer| Ok(writer.write_all(b"tiny")?),
    )?;
    let frame = fs::read(path)?;
    assert_eq!(frame.len(), 24 + 1 + 4);
    assert_eq!(&frame[..8], &1_u64.to_be_bytes());
    assert_eq!(&frame[8..16], &4_u64.to_be_bytes());
    assert_eq!(&frame[16..24], &4_u64.to_be_bytes());
    assert_eq!(&frame[24..], b"atiny");
    Ok(())
}

#[test]
fn long_lineage_moves_and_reopens_under_a_small_descriptor_limit() -> TestResult {
    let (files, mut room, _) = segment_handover_test_source(3, true, true)?;
    let parent = files.room().parent().ok_or("fixture directory")?.to_owned();
    let mut previous = None;
    for i in 0..PREDECESSORS {
        room.grant("owner", &format!("reader-{i}"), Some(Role::Reader))?;
        let archive = parent.join(format!("original-{i}.archive"));
        let checkpoint = parent.join(format!("original-{i}.checkpoint"));
        let mut archive_output = File::create_new(&archive)?;
        let mut checkpoint_output = File::create_new(&checkpoint)?;
        let identity = if i == 0 {
            room.write_relay_segment_base_with_compactable_history(
                "owner",
                &mut archive_output,
                &mut checkpoint_output,
            )?
        } else if i == 1 {
            room.write_relay_segment_base_with_indexed_asset_history(
                "owner",
                &mut archive_output,
                &mut checkpoint_output,
            )?
        } else {
            room.write_relay_segment_base("owner", &mut archive_output, &mut checkpoint_output)?
        };
        archive_output.sync_all()?;
        checkpoint_output.sync_all()?;
        drop((archive_output, checkpoint_output));
        let base = match previous.take() {
            Some(previous) => RelaySegmentBaseFile::open_linked(
                File::open(archive)?,
                File::open(checkpoint)?,
                &identity,
                previous,
            )?,
            None => RelaySegmentBaseFile::open(
                File::open(archive)?,
                File::open(checkpoint)?,
                &identity,
            )?,
        };
        let base = Arc::new(base);
        room = room.continue_into_relay_segment(
            "owner",
            &parent.join(format!("original-room-{i}")),
            base.clone(),
            &format!("next-{i}"),
        )?;
        previous = Some(base);
    }
    drop(previous);
    let document = room.catchup("owner")?;
    let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
    let authority =
        RoomDeploymentAuthority::create(&parent.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, _) = Authentication::issue_token()?;
    let (router, handle) =
        router_with_server_backups_and_deployment_lease(room, auth(&token)?, assets, lease)?;
    let split = handle.capture_portable_relay_segment("owner", &token, &parent.join("split"))?;
    let packed =
        handle.capture_packed_portable_relay_segment("owner", &token, &parent.join("packed"))?;
    let compressed = handle.capture_portable_relay_segment_with_compressed_checkpoints(
        "owner",
        &token,
        &parent.join("compressed"),
    )?;
    assert_eq!(packed, split);
    assert_eq!(compressed, packed);
    assert_eq!(packed.native_predecessors.len(), PREDECESSORS as usize);
    fs::write(parent.join("selection.json"), serde_json::to_vec(&packed)?)?;
    fs::write(parent.join("expected-catchup"), document)?;
    drop((router, handle));
    let parked = parent.join("parked-originals");
    fs::create_dir(&parked)?;
    for entry in fs::read_dir(&parent)? {
        let entry = entry?;
        if entry.file_name().as_encoded_bytes().starts_with(b"original-") {
            fs::rename(entry.path(), parked.join(entry.file_name()))?;
        }
    }
    fs::rename(parent.join("packed"), parent.join("moved"))?;
    check_bad_pack(&parent, &packed)?;
    check_bad_compression(&parent.join("compressed"), &compressed)?;
    check_copy_refusals(&parent, &split)?;

    for layout in ["split", "moved"] {
        let worker = Command::new("/bin/sh")
            .args(["-c", "ulimit -n 48 && exec \"$@\"", "sh"])
            .arg(std::env::current_exe()?)
            .args([
                "--exact",
                "server::segment_handover::tests::packed_lineage::cold_lineage_worker",
                "--nocapture",
            ])
            .env("BREDITOR_LINEAGE_FIXTURE", &parent)
            .env("BREDITOR_LINEAGE_LAYOUT", layout)
            .output()?;
        assert!(
            worker.status.success(),
            "{layout} cold restore: {} {}",
            String::from_utf8_lossy(&worker.stdout),
            String::from_utf8_lossy(&worker.stderr),
        );
    }
    Ok(())
}

#[test]
fn cold_lineage_worker() -> TestResult {
    let Some(root) = std::env::var_os("BREDITOR_LINEAGE_FIXTURE") else {
        return Ok(());
    };
    let root = PathBuf::from(root);
    let layout = std::env::var("BREDITOR_LINEAGE_LAYOUT")?;
    let selected: RelaySegmentPortableBackupIdentity =
        serde_json::from_slice(&fs::read(root.join("selection.json"))?)?;
    match layout.as_str() {
        "split" => {
            let source = root.join("split");
            let result = RelaySegmentRetainedBackup::open_portable(&source, &selected);
            assert!(
                matches!(result, Err(Error::Io(error)) if error.raw_os_error() == Some(EMFILE))
            );
            let original = source.join("native-lineage/0.checkpoint");
            let before = fs::read(&original)?;
            RelaySegmentRetainedBackup::copy_portable_packed(
                &source,
                &root.join("converted"),
                &selected,
            )?;
            assert_eq!(fs::read(original)?, before);
            assert!(!source.join("native-lineage/packed.bin").exists());
            restore_and_reopen(&root, "converted", &selected)?;
            let converted = root.join("converted-compressed");
            RelaySegmentRetainedBackup::copy_portable_with_compressed_checkpoints(
                &source, &converted, &selected,
            )?;
            let filename = "native-lineage/packed.bin";
            assert_eq!(
                fs::read(converted.join(filename))?,
                fs::read(root.join("compressed").join(filename))?
            );
            assert!(
                fs::metadata(converted.join(filename))?.len()
                    < fs::metadata(root.join("moved").join(filename))?.len()
            );
            restore_and_reopen(&root, "converted-compressed", &selected)?;
            let restored_raw = root.join("uncompressed");
            RelaySegmentRetainedBackup::copy_portable_fully_packed(
                &converted,
                &restored_raw,
                &selected,
            )?;
            assert_eq!(
                fs::read(restored_raw.join(filename))?,
                fs::read(root.join("moved").join(filename))?
            );
            restore_and_reopen(&root, "uncompressed", &selected)?;
        }
        "moved" => {
            restore_and_reopen(&root, "moved", &selected)?;
            RelaySegmentRetainedBackup::copy_portable_packed(
                &root.join("moved"),
                &root.join("packed-copy"),
                &selected,
            )?;
            restore_and_reopen(&root, "packed-copy", &selected)?;
            let compressed = root.join("compressed-from-packed");
            RelaySegmentRetainedBackup::copy_portable_with_compressed_checkpoints(
                &root.join("moved"),
                &compressed,
                &selected,
            )?;
            assert_eq!(
                fs::read(compressed.join("native-lineage/packed.bin"))?,
                fs::read(root.join("compressed/native-lineage/packed.bin"))?
            );
            restore_and_reopen(&root, "compressed-from-packed", &selected)?;
            let compacted = root.join("compacted-from-packed");
            RelaySegmentRetainedBackup::copy_portable_with_compacted_history(
                &compressed,
                &compacted,
                &selected,
            )?;
            let compacted_bytes = fs::read(compacted.join("native-lineage/packed.bin"))?;
            let compressed_bytes = fs::read(compressed.join("native-lineage/packed.bin"))?;
            let retired =
                usize::try_from(u64::from_be_bytes(compressed_bytes[12..20].try_into()?))?;
            assert_eq!(&compacted_bytes[..8], b"BRLINE3\n");
            assert_eq!(&compacted_bytes[12..20], &0_u64.to_be_bytes());
            assert!(retired > 0);
            assert_eq!(compacted_bytes.len() + retired, compressed_bytes.len());
            restore_and_reopen(&root, "compacted-from-packed", &selected)?;
            let packed_path = compressed.join("native-lineage/packed.bin");
            let mut corrupted_archive = compressed_bytes.clone();
            corrupted_archive[36] ^= 1;
            fs::write(&packed_path, corrupted_archive)?;
            assert!(
                RelaySegmentRetainedBackup::copy_portable_with_compacted_history(
                    &compressed,
                    &root.join("corrupt-compaction"),
                    &selected,
                )
                .is_err()
            );
            fs::write(packed_path, compressed_bytes)?;
            let migrated = root.join("retired-legacy");
            let retirement = RelaySegmentRetainedBackup::copy_portable_with_retired_history(
                &compacted, &migrated, &selected,
            )?;
            assert_eq!(retirement.backup(), &selected);
            let backup = RelaySegmentRetainedBackup::open_portable_with_retired_history(
                &migrated,
                &retirement,
            )?;
            reopen_backup(&root, "retired-legacy", &backup)?;
            assert!(matches!(
                RelaySegmentRetainedBackup::copy_portable_fully_packed(
                    &compacted,
                    &root.join("impossible-raw-copy"),
                    &selected,
                ),
                Err(Error::Contract("relay predecessor archive has been compacted"))
            ));
        }
        _ => return Err("unknown fixture layout".into()),
    }
    Ok(())
}

fn check_bad_compression(path: &Path, selected: &RelaySegmentPortableBackupIdentity) -> TestResult {
    let packed = path.join("native-lineage/packed.bin");
    let original = fs::read(&packed)?;
    assert_eq!(&original[..8], b"BRLINE2\n");
    let archive = usize::try_from(u64::from_be_bytes(original[12..20].try_into()?))?;
    let decoded = u64::from_be_bytes(original[20..28].try_into()?);
    let stored = u64::from_be_bytes(original[28..36].try_into()?);
    assert!(stored + 1 < decoded);
    let end = 36 + archive + usize::try_from(stored)?;
    let mut wrong_trailer = original.clone();
    wrong_trailer[end - 8] ^= 1;
    let mut wrong_length = original.clone();
    wrong_length[20..28].copy_from_slice(&(decoded - 1).to_be_bytes());
    let mut trailing = original.clone();
    trailing[28..36].copy_from_slice(&(stored + 1).to_be_bytes());
    trailing.insert(end, 0);
    for invalid in [wrong_trailer, wrong_length, trailing] {
        fs::write(&packed, invalid)?;
        assert!(RelaySegmentRetainedBackup::open_portable(path, selected).is_err());
    }
    fs::write(packed, original)?;
    Ok(())
}

fn restore_and_reopen(
    root: &Path,
    name: &str,
    selected: &RelaySegmentPortableBackupIdentity,
) -> TestResult {
    let backup = RelaySegmentRetainedBackup::open_portable(&root.join(name), selected)?;
    reopen_backup(root, name, &backup)
}

fn reopen_backup(root: &Path, name: &str, backup: &RelaySegmentRetainedBackup) -> TestResult {
    let path = root.join(format!("cold-room-{name}"));
    let target = backup.restore(&path, "cold-one", POLICY)?;
    assert_eq!(
        target.components().0.catchup("owner")?,
        fs::read_to_string(root.join("expected-catchup"))?
    );
    target.components().0.catchup(&format!("reader-{}", PREDECESSORS - 1))?;
    drop(target);
    backup.backup().reopen(&path, POLICY)?.components().0.catchup("reader-0")?;
    Ok(())
}

fn check_copy_refusals(root: &Path, selected: &RelaySegmentPortableBackupIdentity) -> TestResult {
    let source = root.join("split");
    let occupied = root.join("occupied");
    fs::create_dir(&occupied)?;
    fs::write(occupied.join("sentinel"), b"keep")?;
    assert!(
        RelaySegmentRetainedBackup::copy_portable_packed(&source, &occupied, selected).is_err()
    );
    assert_eq!(fs::read(occupied.join("sentinel"))?, b"keep");

    let child = source.join("nested-copy");
    assert!(RelaySegmentRetainedBackup::copy_portable_packed(&source, &child, selected).is_err());
    assert!(!child.exists());

    let differently_cased_source = root.join("SPLIT");
    if differently_cased_source.is_dir() {
        let descendant = source.join("native-lineage/nested-copy");
        assert!(
            RelaySegmentRetainedBackup::copy_portable_packed(
                &differently_cased_source,
                &descendant,
                selected,
            )
            .is_err()
        );
        assert!(!descendant.exists());
    }

    let checkpoint = source.join("native-lineage/0.checkpoint");
    let original = fs::read(&checkpoint)?;
    let mut changed = original.clone();
    let last = changed.last_mut().ok_or("split checkpoint bytes")?;
    *last ^= 1;
    fs::write(&checkpoint, &changed)?;
    let invalid = root.join("invalid-copy");
    assert!(RelaySegmentRetainedBackup::copy_portable_packed(&source, &invalid, selected).is_err());
    assert!(RelaySegmentRetainedBackup::open_portable(&invalid, selected).is_err());
    assert_eq!(fs::read(&checkpoint)?, changed);
    fs::write(checkpoint, original)?;
    Ok(())
}

fn check_bad_pack(root: &Path, selected: &RelaySegmentPortableBackupIdentity) -> TestResult {
    let bundle = root.join("moved");
    let directory = bundle.join("native-lineage");
    let path = directory.join("packed.bin");
    let original = fs::read(&path)?;
    let mut wrong_count = original.clone();
    wrong_count[11] ^= 1;
    let mut changed = original.clone();
    let last = changed.last_mut().ok_or("packed lineage bytes")?;
    *last ^= 1;
    let mut trailing = original.clone();
    trailing.push(0);
    for invalid in [wrong_count, changed, trailing] {
        fs::write(&path, invalid)?;
        assert!(RelaySegmentRetainedBackup::open_portable(&bundle, selected).is_err());
    }
    fs::write(&path, original)?;
    fs::write(directory.join("0.archive"), [])?;
    assert!(RelaySegmentRetainedBackup::open_portable(&bundle, selected).is_err());
    fs::remove_file(directory.join("0.archive"))?;
    Ok(())
}
