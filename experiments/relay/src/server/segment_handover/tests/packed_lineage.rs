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
        let identity =
            room.write_relay_segment_base("owner", &mut archive_output, &mut checkpoint_output)?;
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
    assert_eq!(packed, split);
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
        }
        "moved" => {
            restore_and_reopen(&root, "moved", &selected)?;
            RelaySegmentRetainedBackup::copy_portable_packed(
                &root.join("moved"),
                &root.join("packed-copy"),
                &selected,
            )?;
            restore_and_reopen(&root, "packed-copy", &selected)?;
        }
        _ => return Err("unknown fixture layout".into()),
    }
    Ok(())
}

fn restore_and_reopen(
    root: &Path,
    name: &str,
    selected: &RelaySegmentPortableBackupIdentity,
) -> TestResult {
    let backup = RelaySegmentRetainedBackup::open_portable(&root.join(name), selected)?;
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
