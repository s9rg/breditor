//! Run the actual reference relay command with one committed, cold sealed room.
#![cfg(all(feature = "server", unix))]
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{
    AtomicTransportProfile, RecoveryRegistrationCredentials, Role, Room, RoomRecoveryPolicy,
    ServerLogGenerationOptions, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, NativeGenerationActivationPrepareOptions,
        PreparedNativeGenerationActivationIdentity, RoomDeploymentAuthority,
        ServerLogGenerationRecoveryCoverage, ServerLogGenerationRecoveryStateIdentity,
        prepare_log_generation_recovery_host,
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Write},
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::Arc,
};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Directory(PathBuf);
impl Directory {
    fn create() -> Result<Self> {
        let (nonce, _) = Authentication::issue_token()?;
        let path = std::env::temp_dir().join(format!("breditor-cli-inspection-{nonce}"));
        fs::DirBuilder::new().mode(0o700).create(&path)?;
        Ok(Self(path.canonicalize()?))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct Fixture {
    directory: Directory,
    owner: String,
    expected: PreparedNativeGenerationActivationIdentity,
    expected_archive: Vec<u8>,
    expected_inventory: String,
    active_wal: PathBuf,
    raster: PathBuf,
}

impl Fixture {
    fn request(&self, mode: &str, current: &ServerLogGenerationRecoveryStateIdentity) -> Value {
        let root = &self.directory.0;
        json!({
            "format": "breditor/sealed-room-inspection-request", "formatVersion": 1, "mode": mode,
            "principal": "owner", "sourceRoot": root.join("source-seal"),
            "checkpointRoot": root.join("checkpoint"), "authorityRoot": root.join("authority"),
            "operationalRoot": root.join("operating"), "expectedCheckpoint": self.expected,
            "expectedCurrent": current
        })
    }

    fn run(&self, request: &Value, token: &str, destination: &Path) -> Result<Output> {
        let config = self.directory.0.join("request.json");
        fs::write(&config, serde_json::to_vec(request)?)?;
        let binary = std::env::var_os("BREDITOR_INSTALLED_INSPECTION_RELAY")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_breditor-collab-relay").into());
        let mut child = Command::new(binary)
            .arg("inspect-sealed-room")
            .arg(config)
            .arg(self.directory.0.join("auth.json"))
            .arg(destination)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        writeln!(child.stdin.take().ok_or("owner token pipe")?, "{token}")?;
        let output = child.wait_with_output()?;
        for bytes in [&output.stdout, &output.stderr] {
            assert!(!String::from_utf8_lossy(bytes).contains(token));
        }
        Ok(output)
    }
}

fn capture_files(path: &Path) -> Result<BTreeMap<PathBuf, Vec<u8>>> {
    let mut captured = BTreeMap::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            captured.extend(capture_files(&entry.path())?);
        } else {
            captured.insert(entry.path(), fs::read(entry.path())?);
        }
    }
    Ok(captured)
}

fn authentication() -> Result<(Authentication, String, String)> {
    let (token, digest) = Authentication::issue_token()?;
    let config = json!({"format":"breditor/relay-auth","formatVersion":1,
        "origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":digest}]})
    .to_string();
    Ok((Authentication::from_json(&config)?, token, config))
}

fn original_room(directory: &Path) -> Result<(Room, AssetStore)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,
        "schema":{"name":"example/sealed-inspection-cli","version":1},"extensions":[]})
    .to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/sealed-inspection-cli","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("../../../crates/breditor-core/tests/fixtures/rich-local-root.json"))?}).to_string();
    let mut room = Room::create_atomic_log_generations_v2(
        &directory.join("original"),
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        &ServerLogGenerationOptions { root: "root".into(), active: "first".into() },
    )?;
    room.grant("owner", "retained-reader", Some(Role::Reader))?;
    let mut rasters = AssetStore::open(&directory.join("original-rasters"), room.asset_binding())?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let asset = asset_id(&png);
    let receipt =
        room.put_asset("owner", &mut rasters, prepare_asset(&asset, "image/png", png)?)?;
    assert!(!receipt.duplicate);
    Ok((room, rasters))
}

async fn sealed_room() -> Result<Fixture> {
    let directory = Directory::create()?;
    let fixture_root = &directory.0;
    let (mut room, mut rasters) = original_room(&directory.0)?;
    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut rasters, "owner")?;
    let origin = original.info()?.identity;
    let authority_root = fixture_root.join("authority");
    let authority = RoomDeploymentAuthority::create(&authority_root, &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (auth, owner, _) = authentication()?;
    let (router, live) = Box::pin(router_with_log_generation_backups_and_deployment_lease(
        room, auth, rasters, lease, "owner", &owner,
    ))
    .await?;
    let source_root = fixture_root.join("source-seal");
    let intent = live.prepare_handover("owner", &owner, &source_root, origin.clone()).await?;
    let selected = intent.identity().clone();
    let seal = Arc::new(live.seal_prepared_handover("owner", &owner, intent, &selected).await?);

    let operating = fixture_root.join("operating");
    let policy = RoomRecoveryPolicy::HostReacquired;
    let operational =
        ServerLogGenerationRoomRecovery::begin(&operating, &original, &origin, policy)?
            .finish(&original)?
            .begin_operation(&original, &origin, policy, "owner")?;
    let (auth, owner, auth_json) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operational,
        auth,
        original,
        &origin,
        "owner",
        &owner,
    ))
    .await?;
    let expected = host.capture_recovery_state("owner", &owner).await?;
    let expected_current = expected.identity()?;
    let (expected_archive, inventory) = expected.into_parts();
    let expected_inventory = inventory.to_json().to_owned();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected_current.clone(),
            inventory,
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("no protected registrations in the independent fixture".into());
    };
    let checkpoint_root = fixture_root.join("checkpoint");
    let checkpoint = Arc::new(
        Box::pin(host.prepare_durable_native_activation(
            "owner",
            &owner,
            seal.clone(),
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: checkpoint_root.clone(),
                authority: authority.clone(),
            },
        ))
        .await?,
    );
    let expected_checkpoint = checkpoint.identity().clone();
    let active = Box::pin(host.activate_durable_native_service(
        "owner",
        &owner,
        authority.clone(),
        checkpoint.clone(),
        proof,
        expected_checkpoint.clone(),
    ))
    .await?;
    drop(active);
    drop(checkpoint);
    drop(host);
    drop(seal);
    drop(live);
    drop(router);

    let (active_wal, raster) = selected_files(&operating)?;
    let auth_path = fixture_root.join("auth.json");
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(auth_path)?
        .write_all(auth_json.as_bytes())?;
    Ok(Fixture {
        directory,
        owner,
        expected: expected_checkpoint,
        expected_archive: expected_archive.to_bytes()?,
        expected_inventory,
        active_wal,
        raster,
    })
}

fn selected_files(operating: &Path) -> Result<(PathBuf, PathBuf)> {
    let clean = capture_files(operating)?;
    let head = clean
        .keys()
        .find(|path| path.file_name().is_some_and(|name| name == ".head.json"))
        .ok_or("selected native head")?;
    let head_value: Value = serde_json::from_slice(&fs::read(head)?)?;
    let hash: [u8; 32] = serde_json::from_value(head_value["manifest"].clone())?;
    let manifest = head.with_file_name(format!("m-{}.json", hex(&hash)));
    let manifest_value: Value = serde_json::from_slice(&fs::read(manifest)?)?;
    let generation = manifest_value["active"]["generation"].as_str().ok_or("active generation")?;
    let mut digest = Sha256::new();
    digest.update(b"breditor/relay-log-file/1\0");
    digest.update(generation.as_bytes());
    let active_wal = head.with_file_name(format!("g-{}.wal", hex(&digest.finalize())));
    let raster = clean
        .keys()
        .find(|path| path.extension().is_some_and(|name| name == "asset"))
        .ok_or("admitted raster")?
        .clone();
    Ok((active_wal, raster))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(result, "{byte:02x}").expect("write to String");
    }
    result
}

fn check_pin(directory: &Path, pin: &Value, name: &str) -> Result<Vec<u8>> {
    assert_eq!(pin["file"], name);
    let path = directory.join(name);
    let bytes = fs::read(&path)?;
    assert_eq!(fs::metadata(&path)?.mode() & 0o777, 0o600);
    assert_eq!(pin["bytes"], bytes.len());
    assert_eq!(pin["sha256"], json!(<[u8; 32]>::from(Sha256::digest(&bytes))));
    Ok(bytes)
}

fn inspect(fixture: &Fixture, request: &Value, name: &str) -> Result<(PathBuf, Value)> {
    let destination = fixture.directory.0.join(name);
    let result = fixture.run(request, &fixture.owner, &destination)?;
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    assert_eq!(result.stdout, b"retained sealed room inspection\n");
    assert_eq!(fs::metadata(&destination)?.mode() & 0o777, 0o700);
    let selection = serde_json::from_slice(&fs::read(destination.join("selection.json"))?)?;
    assert_eq!(fs::metadata(destination.join("selection.json"))?.mode() & 0o777, 0o600);
    Ok((destination, selection))
}

#[tokio::test]
async fn cli_retains_complete_cut_and_refuses_unsafe_destinations() -> Result {
    let fixture = Box::pin(sealed_room()).await?;
    let root = &fixture.directory.0;
    let request = fixture.request("complete", fixture.expected.current());
    let operating = root.join("operating");
    let before = capture_files(&operating)?;
    let (output, manifest) = inspect(&fixture, &request, "retained")?;
    assert_eq!(manifest["format"], "breditor/sealed-room-inspection");
    assert_eq!(manifest["formatVersion"], 1);
    assert_eq!(manifest["mode"], "complete");
    assert_eq!(manifest["current"], json!(fixture.expected.current()));
    assert_eq!(check_pin(&output, &manifest["archive"], "room.backup")?, fixture.expected_archive);
    assert_eq!(
        check_pin(&output, &manifest["participants"], "participants.json")?,
        fixture.expected_inventory.as_bytes()
    );
    assert_eq!(manifest["pending"], json!({}));
    assert_eq!(fs::read_dir(&output)?.count(), 3);
    let preserved = capture_files(&output)?;
    assert!(!fixture.run(&request, &fixture.owner, &output)?.status.success());
    assert_eq!(capture_files(&output)?, preserved);
    let forbidden = operating.join("must-stay-absent");
    assert!(!fixture.run(&request, &fixture.owner, &forbidden)?.status.success());
    assert!(!forbidden.exists());
    let outside_alias = root.join("operator-alias");
    std::os::unix::fs::symlink(&operating, &outside_alias)?;
    assert!(
        !fixture.run(&request, &fixture.owner, &outside_alias.join("via-alias"))?.status.success()
    );
    assert_eq!(capture_files(&operating)?, before);
    let rejected = root.join("wrong-owner");
    let (bad_token, _) = Authentication::issue_token()?;
    assert!(!fixture.run(&request, &bad_token, &rejected)?.status.success());
    assert!(!rejected.exists());
    Ok(())
}

#[tokio::test]
async fn cli_retains_descendant_cut_and_both_exact_interrupted_writes() -> Result {
    let fixture = Box::pin(sealed_room()).await?;
    let operating = fixture.directory.0.join("operating");
    let (mut room, _) =
        Room::open_log_generations(fixture.active_wal.parent().ok_or("WAL parent")?)?;
    room.grant("owner", "accepted-after-checkpoint", Some(Role::Reader))?;
    drop(room);
    let (floor, complete) =
        inspect(&fixture, &fixture.request("complete", fixture.expected.current()), "floor")?;
    let current: ServerLogGenerationRecoveryStateIdentity =
        serde_json::from_value(complete["current"].clone())?;
    assert_ne!(&current, fixture.expected.current());
    let accepted = check_pin(&floor, &complete["archive"], "room.backup")?;
    let suffix = [0, 0, 0, 0, 0, 0, 0, 120];
    let mut wal = fs::OpenOptions::new().append(true).open(&fixture.active_wal)?;
    wal.write_all(&suffix)?;
    wal.sync_all()?;
    drop(wal);
    let mut tail_request = fixture.request("native-tail", &current);
    tail_request["minimumArchive"] = json!(floor.join("room.backup"));
    let (tail, tail_manifest) = inspect(&fixture, &tail_request, "tail")?;
    assert_eq!(check_pin(&tail, &tail_manifest["pending"]["walSuffix"], "wal-suffix.bin")?, suffix);
    let (nonce, _) = Authentication::issue_token()?;
    let stage = fixture.raster.with_file_name(format!(".pending-{nonce}"));
    fs::hard_link(&fixture.raster, &stage)?;
    let before = capture_files(&operating)?;
    let wrong = fixture.directory.0.join("wrong-floor");
    let mut request = fixture.request("native-tail-and-raster", &current);
    assert!(!fixture.run(&request, &fixture.owner, &wrong)?.status.success());
    assert!(!wrong.exists());
    request["minimumArchive"] = json!(floor.join("room.backup"));
    let (output, manifest) = inspect(&fixture, &request, "both")?;
    assert_eq!(manifest["current"], complete["current"]);
    assert_eq!(check_pin(&output, &manifest["archive"], "room.backup")?, accepted);
    assert_eq!(check_pin(&output, &manifest["pending"]["walSuffix"], "wal-suffix.bin")?, suffix);
    let raster_pin = &manifest["pending"]["rasterStage"];
    assert!(raster_pin["publishedAsset"].as_str().is_some());
    assert_eq!(check_pin(&output, &raster_pin["evidence"], "raster-stage.bin")?, fs::read(stage)?);
    assert_eq!(capture_files(&operating)?, before);
    let wal = fs::OpenOptions::new().write(true).open(&fixture.active_wal)?;
    wal.set_len(wal.metadata()?.len() - suffix.len() as u64)?;
    wal.sync_all()?;
    drop(wal);
    request["mode"] = json!("raster-upload");
    let (only_raster, selection) = inspect(&fixture, &request, "raster-only")?;
    assert_eq!(selection["current"], complete["current"]);
    assert_eq!(selection["pending"], json!({"rasterStage": raster_pin}));
    check_pin(&only_raster, &raster_pin["evidence"], "raster-stage.bin")?;
    Ok(())
}

#[derive(Deserialize, Serialize)]
struct Seal {
    generation: String,
    first: u64,
    records: u64,
    previous: [u8; 32],
    terminal: [u8; 32],
    bytes: u64,
    sha256: [u8; 32],
}

#[derive(Serialize)]
struct Inode {
    device: u64,
    inode: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingRotation {
    format: &'static str,
    format_version: u32,
    before: [u8; 32],
    after: [u8; 32],
    next: &'static str,
    sealed: Seal,
    stage: String,
    identity: Inode,
}

fn keep_pending_rotation(fixture: &Fixture) -> Result<[u8; 32]> {
    let native = fixture.active_wal.parent().ok_or("active WAL directory")?;
    let (mut room, _) = Room::open_log_generations(native)?;
    room.grant("owner", "accepted-before-rotation", Some(Role::Reader))?;
    let before = room.log_generation_descriptor("owner")?.manifest;
    let after = room.rotate_log_generation("owner", "cli-rotation")?.after_manifest;
    drop(room);
    let manifest: Value =
        serde_json::from_slice(&fs::read(native.join(format!("m-{}.json", hex(&after))))?)?;
    let sealed =
        manifest["sealed"].as_array().and_then(|items| items.last()).ok_or("sealed generation")?;
    let next_digest = Sha256::digest(b"breditor/relay-log-file/1\0cli-rotation");
    let active = native.join(format!("g-{}.wal", hex(&next_digest)));
    let (nonce, _) = Authentication::issue_token()?;
    let stage = format!(".stage-{nonce}");
    fs::hard_link(&active, native.join(&stage))?;
    let inode = fs::metadata(active)?;
    let intent = PendingRotation {
        format: "breditor/relay-log-rotation",
        format_version: 1,
        before,
        after,
        next: "cli-rotation",
        sealed: serde_json::from_value(sealed.clone())?,
        stage,
        identity: Inode { device: inode.dev(), inode: inode.ino() },
    };
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(native.join(".rotation.json"))?;
    file.write_all(&serde_json::to_vec(&intent)?)?;
    file.sync_all()?;
    fs::File::open(native)?.sync_all()?;
    Ok(after)
}

#[tokio::test]
async fn cli_retains_rotation_and_exact_pending_raster_evidence() -> Result {
    let fixture = Box::pin(sealed_room()).await?;
    let planned = keep_pending_rotation(&fixture)?;
    let (output, manifest) =
        inspect(&fixture, &fixture.request("rotation", fixture.expected.current()), "rotation")?;
    let rotation = &manifest["pending"]["rotation"];
    assert_eq!(rotation["plannedManifest"], json!(planned));
    assert_eq!(rotation["headPublished"], true);
    let evidence = check_pin(&output, &rotation["evidence"], "rotation.json")?;
    let (nonce, _) = Authentication::issue_token()?;
    let stage = fixture.raster.with_file_name(format!(".pending-{nonce}"));
    fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(stage)?.sync_all()?;
    let operating = fixture.directory.0.join("operating");
    let before = capture_files(&operating)?;
    let (output, combined) = inspect(
        &fixture,
        &fixture.request("rotation-and-raster", fixture.expected.current()),
        "rotation-and-raster",
    )?;
    assert_eq!(combined["current"], manifest["current"]);
    assert_eq!(
        check_pin(&output, &combined["pending"]["rotation"]["evidence"], "rotation.json")?,
        evidence
    );
    let raster = &combined["pending"]["rasterStage"];
    assert!(raster["publishedAsset"].is_null());
    assert!(check_pin(&output, &raster["evidence"], "raster-stage.bin")?.is_empty());
    assert_eq!(capture_files(&operating)?, before);
    Ok(())
}
