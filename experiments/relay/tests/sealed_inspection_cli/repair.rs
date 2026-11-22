//! Apply a retained selection through the installed or source-built relay executable.
use super::{
    Authentication, Fixture, MetadataExt, OpenOptionsExt, OsStr, Output, Path, PathBuf, Result,
    Role, ServerLogGenerationRecoveryStateIdentity, Sha256, Value, Write, capture_files, check_pin,
    fs, hex, inspect, json, keep_pending_rotation, reopen_fixture_native_log, sealed_room,
};
use sha2::Digest;

const SUFFIX: [u8; 8] = [0, 0, 0, 0, 0, 0, 0, 120];

struct Retained {
    directory: PathBuf,
    manifest: Value,
    request: Value,
    pin: String,
}

impl Retained {
    fn inspect(fixture: &Fixture, mode: &str) -> Result<Self> {
        let (directory, manifest) =
            inspect(fixture, &fixture.request(mode, fixture.expected.current()), "evidence")?;
        let current: ServerLogGenerationRecoveryStateIdentity =
            serde_json::from_value(manifest["current"].clone())?;
        let request = fixture.request(mode, &current);
        let pin = hex(&Sha256::digest(fs::read(directory.join("selection.json"))?));
        Ok(Self { directory, manifest, request, pin })
    }

    fn execute(
        &self,
        fixture: &Fixture,
        token: &str,
        pin: &str,
        destination: &Path,
    ) -> Result<Output> {
        fixture.command(
            "repair-sealed-room",
            &self.request,
            token,
            &[self.directory.as_os_str(), OsStr::new(pin), destination.as_os_str()],
        )
    }

    fn apply(&self, fixture: &Fixture, name: &str) -> Result<Value> {
        let destination = fixture.directory.0.join(name);
        let output = self.execute(fixture, &fixture.owner, &self.pin, &destination)?;
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        assert_eq!(output.stdout, b"repaired sealed room and retained complete selection\n");
        let receipt: Value =
            serde_json::from_slice(&fs::read(destination.join("selection.json"))?)?;
        assert_eq!(receipt["mode"], "complete");
        assert_eq!(receipt["pending"], json!({}));
        check_pin(&destination, &receipt["archive"], "room.backup")?;
        check_pin(&destination, &receipt["participants"], "participants.json")?;
        Ok(receipt)
    }
}

fn write_partial_wal(fixture: &Fixture) -> Result {
    let mut wal = fs::OpenOptions::new().append(true).open(&fixture.active_wal)?;
    wal.write_all(&SUFFIX)?;
    wal.sync_all()?;
    Ok(())
}

fn stage_raster(fixture: &Fixture, published: bool) -> Result<PathBuf> {
    let (nonce, _) = Authentication::issue_token()?;
    let stage = fixture.raster.with_file_name(format!(".pending-{nonce}"));
    if published {
        fs::hard_link(&fixture.raster, &stage)?;
    } else {
        fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&stage)?.sync_all()?;
    }
    Ok(stage)
}

#[tokio::test]
async fn repair_cli_applies_native_tail_raster_and_combined_modes() -> Result {
    for (mode, tail, raster) in [
        ("native-tail", true, false),
        ("raster-upload", false, true),
        ("native-tail-and-raster", true, true),
    ] {
        let fixture = Box::pin(sealed_room()).await?;
        let operating = fixture.directory.0.join("operating");
        let before = capture_files(&operating)?;
        let ledger = capture_files(&fixture.directory.0.join("authority"))?;
        let checkpoint = capture_files(&fixture.directory.0.join("checkpoint"))?;
        let wal_inode = fs::metadata(&fixture.active_wal)?.ino();
        let raster_inode = fs::metadata(&fixture.raster)?.ino();
        if tail {
            write_partial_wal(&fixture)?;
        }
        if raster {
            stage_raster(&fixture, true)?;
        }
        let retained = Retained::inspect(&fixture, mode)?;
        let saved = capture_files(&retained.directory)?;
        let receipt = retained.apply(&fixture, "repaired")?;
        assert_eq!(receipt["current"], retained.manifest["current"]);
        assert_eq!(capture_files(&operating)?, before);
        assert_eq!(capture_files(&retained.directory)?, saved);
        assert_eq!(capture_files(&fixture.directory.0.join("authority"))?, ledger);
        assert_eq!(capture_files(&fixture.directory.0.join("checkpoint"))?, checkpoint);
        assert_eq!(fs::metadata(&fixture.active_wal)?.ino(), wal_inode);
        assert_eq!(fs::metadata(&fixture.raster)?.ino(), raster_inode);
        if mode == "native-tail" {
            assert_eq!(retained.apply(&fixture, "retried")?, receipt);
        }
    }
    Ok(())
}

#[tokio::test]
async fn repair_cli_refuses_changed_evidence_and_unapproved_paths() -> Result {
    let fixture = Box::pin(sealed_room()).await?;
    stage_raster(&fixture, true)?;
    let operating = fixture.directory.0.join("operating");
    let before = capture_files(&operating)?;
    let retained = Retained::inspect(&fixture, "raster-upload")?;
    let denied = fixture.directory.0.join("denied");
    assert!(
        !retained.execute(&fixture, &fixture.owner, &"0".repeat(64), &denied)?.status.success()
    );
    let (wrong_owner, _) = Authentication::issue_token()?;
    assert!(!retained.execute(&fixture, &wrong_owner, &retained.pin, &denied)?.status.success());
    let forbidden = retained.directory.join("must-stay-absent");
    assert!(
        !retained.execute(&fixture, &fixture.owner, &retained.pin, &forbidden)?.status.success()
    );
    assert!(!forbidden.exists());

    let inventory = retained.directory.join("participants.json");
    let saved = fs::read(&inventory)?;
    let mut changed = saved.clone();
    changed[0] ^= 1;
    fs::write(&inventory, changed)?;
    assert!(!retained.execute(&fixture, &fixture.owner, &retained.pin, &denied)?.status.success());
    fs::write(inventory, saved)?;
    let evidence = retained.directory.join("selection.json");
    let raw = fs::read(&evidence)?;
    let mut changed = retained.manifest.clone();
    changed["pending"]["rasterStage"]["evidence"]["file"] = json!("../raster-stage.bin");
    let changed = serde_json::to_vec(&changed)?;
    fs::write(&evidence, &changed)?;
    let repinned = hex(&Sha256::digest(&changed));
    assert!(!retained.execute(&fixture, &fixture.owner, &repinned, &denied)?.status.success());
    fs::write(evidence, raw)?;
    assert!(!denied.exists());
    assert_eq!(capture_files(&operating)?, before);
    let mut room =
        reopen_fixture_native_log(fixture.active_wal.parent().ok_or("selected WAL directory")?)
            .await?;
    room.grant("owner", "accepted-after-inspection", Some(Role::Reader))?;
    drop(room);
    let advanced = capture_files(&operating)?;
    assert!(!retained.execute(&fixture, &fixture.owner, &retained.pin, &denied)?.status.success());
    assert!(!denied.exists());
    assert_eq!(capture_files(&operating)?, advanced);
    Ok(())
}

#[tokio::test]
async fn repair_cli_completes_rotation_and_retains_the_actual_selected_head() -> Result {
    for (mode, published) in [("rotation", true), ("rotation-and-raster", false)] {
        let fixture = Box::pin(sealed_room()).await?;
        let operating = fixture.directory.0.join("operating");
        let planned = keep_pending_rotation(&fixture, published).await?;
        let stage = (!published).then(|| stage_raster(&fixture, false)).transpose()?;
        let before = capture_files(&operating)?;
        let ledger = capture_files(&fixture.directory.0.join("authority"))?;
        let retained = Retained::inspect(&fixture, mode)?;
        reject_inconsistent_manifest(&fixture, &retained)?;
        assert_eq!(capture_files(&operating)?, before);
        let saved = capture_files(&retained.directory)?;
        let receipt = retained.apply(&fixture, "rotated")?;
        let selected = &receipt["current"]["server"];
        assert_eq!(selected["native"]["manifest"], json!(planned));
        assert_eq!(
            selected["native"]["source"],
            retained.manifest["current"]["server"]["native"]["source"]
        );
        assert_eq!(selected["assets"], retained.manifest["current"]["server"]["assets"]);
        assert_eq!(receipt["current"] == retained.manifest["current"], published);
        if let Some(stage) = stage {
            assert!(!stage.exists());
        }
        assert_eq!(capture_files(&retained.directory)?, saved);
        assert_eq!(capture_files(&fixture.directory.0.join("authority"))?, ledger);
        assert!(!fixture.active_wal.with_file_name(".rotation.json").exists());
        let (_, reopened) = inspect(
            &fixture,
            &fixture.request("complete", fixture.expected.current()),
            "fresh-inspection",
        )?;
        assert_eq!(reopened["current"], receipt["current"]);
    }
    Ok(())
}

fn reject_inconsistent_manifest(fixture: &Fixture, retained: &Retained) -> Result {
    let evidence = retained.directory.join("selection.json");
    let saved = fs::read(&evidence)?;
    let mut changed = retained.manifest.clone();
    changed["pending"]["rotation"]["plannedManifest"] = serde_json::to_value([0_u8; 32])?;
    let changed = serde_json::to_vec(&changed)?;
    fs::write(&evidence, &changed)?;
    let pin = hex(&Sha256::digest(&changed));
    let output = fixture.directory.0.join("wrong-rotation");
    assert!(!retained.execute(fixture, &fixture.owner, &pin, &output)?.status.success());
    assert!(!output.exists());
    fs::write(evidence, saved)?;
    Ok(())
}
