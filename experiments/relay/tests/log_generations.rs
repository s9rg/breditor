//! Actual public native editing across physical storage boundaries, not a substitute merge model.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use breditor_collab_relay::{
    Admission, AtomicTransportProfile, Lease, Role, Room, ServerLogGenerationOptions,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
#[path = "log_generations/assets.rs"]
mod assets;
#[path = "log_generations/backup.rs"]
mod backup;
#[path = "log_generations/recovery.rs"]
mod generation_recovery;
#[cfg(feature = "server")]
#[path = "log_generations/host.rs"]
mod host;
#[path = "log_generations/joined_room.rs"]
mod joined_room;
#[cfg(all(feature = "server", unix))]
#[path = "log_generations/live_handover.rs"]
mod live_handover;
#[cfg(all(feature = "server", unix))]
#[path = "log_generations/native_activation.rs"]
mod native_activation;
#[path = "log_generations/participants.rs"]
mod participants;
#[cfg(feature = "server")]
#[path = "log_generations/physical_assets.rs"]
mod physical_assets;
#[cfg(feature = "server")]
#[path = "log_generations/physical_host.rs"]
mod physical_host;

#[cfg(feature = "server")]
#[path = "log_generations/generation_assets.rs"]
mod generation_assets;

struct Files(PathBuf);
impl Files {
    fn new() -> TestResult<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir()
            .join(format!("breditor-log-generations-{}-{nonce}-{serial}", std::process::id()));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    fn room(&self) -> PathBuf {
        self.0.join("room")
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        // Only this test's exclusively created nonce directory; never live application storage.
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn setup(
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(Files, SharedRichProfile, Room)> {
    let files = Files::new()?;
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/log-generations","version":1},"extensions":[]})
    .to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("explicit native fixture compiler".into()),
    };
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/log-generations","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("../../../crates/breditor-core/tests/fixtures/rich-local-root.json"))?}).to_string();
    let kind = match version {
        1 => AtomicTransportProfile::Original,
        2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
        _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
    };
    let options = ServerLogGenerationOptions { root: "root".into(), active: "one".into() };
    let room = if atomic {
        Room::create_atomic_log_generations_v2(
            &files.room(),
            &configuration,
            &document,
            "owner",
            kind,
            &options,
        )?
    } else {
        Room::create_log_generations(
            &files.room(),
            &configuration,
            &document,
            "owner",
            kind,
            &options,
        )?
    };
    Ok((files, profile, room))
}
fn insert(owner: &mut RichReplica, text: &str) -> TestResult {
    owner.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
fn send(
    room: &mut Room,
    owner: &RichReplica,
    principal: &str,
    lease: &Lease,
    after: &str,
    atomic: bool,
) -> TestResult<String> {
    let groups: Value = serde_json::from_str(&if atomic {
        owner.writer_groups_v2_guarded(&owner.observe()?, after)?
    } else {
        owner.writer_groups_guarded(&owner.observe()?, after)?
    })?;
    for frame in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit(principal, lease, frame.as_str().ok_or("frame")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("through")?.into())
}
fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    let initial = room.log_generation_descriptor("owner")?;
    assert_eq!(initial.next_sequence, "1");
    assert_eq!(initial.sealed, 0);
    assert!(room.backup_identity().is_err());
    assert!(room.export_backup().is_err());
    room.grant("owner", "alice", Some(Role::Editor))?;
    let author = room.register("alice")?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("alice")?)?;
    insert(&mut client, "Old retained ")?;
    let mut through = send(&mut room, &client, "alice", &author.lease, "0", atomic)?;
    insert(&mut client, "Old offline ")?;
    let saved = client.checkpoint()?;
    let before = room.log_generation_descriptor("owner")?;
    let frame = room.catchup("alice")?;
    let receipt = room.rotate_log_generation("owner", "two")?;
    assert_eq!(receipt.next_sequence, before.next_sequence);
    assert_eq!(receipt.terminal_digest, before.terminal_digest);
    assert_eq!(room.catchup("alice")?, frame);
    room.grant("owner", "bob", Some(Role::Editor))?;
    let peer = room.register("bob")?;
    let mut other =
        profile.join_frame("room".into(), peer.lease.writer.clone(), &room.catchup("bob")?)?;
    insert(&mut other, "Peer preserved ")?;
    send(&mut room, &other, "bob", &peer.lease, "0", atomic)?;
    room.rotate_log_generation("owner", "three")?;
    let selected = room.log_generation_descriptor("owner")?;
    drop(room);
    assert!(Room::open(&files.room()).is_err());
    let (mut room, recovered) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovered.truncated_bytes, 0);
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    let repeated = room.rotate_log_generation("owner", "two")?;
    assert!(repeated.duplicate);
    assert_eq!(repeated.after_manifest, receipt.after_manifest);
    assert_eq!(repeated.next_sequence, receipt.next_sequence);
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    assert!(room.validate_lease("alice", &author.lease).is_err());
    let lease = room.resume("alice", &author.lease.writer, &author.credential)?;
    client = profile.restore("room", &saved)?;
    through = send(&mut room, &client, "alice", &lease, &through, atomic)?;
    client.receive_frame(&room.catchup("alice")?)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(&mut room, &client, "alice", &lease, &through, atomic)?;
        assert!(client.document_json().contains("Peer preserved "));
        let observer = profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), client.document_json());
    }
    Ok(())
}

#[test]
fn all_ten_profile_transport_choices_preserve_offline_native_history_across_two_physical_cuts()
-> TestResult {
    let mut cases = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            workflow(version, standard, atomic)?;
            cases += 1;
        }
    }
    assert_eq!(cases, 10);
    Ok(())
}

#[test]
fn known_head_replacement_permanently_fences_the_actual_owner() -> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let head = files.room().join(".head.json");
    let old = files.room().join("held-head");
    let bytes = fs::read(&head)?;
    fs::rename(&head, &old)?;
    fs::write(&head, &bytes)?;
    assert!(room.log_generation_descriptor("owner").is_err());
    fs::remove_file(&head)?;
    fs::rename(&old, &head)?;
    assert!(matches!(
        room.log_generation_descriptor("owner"),
        Err(breditor_collab_relay::Error::NeedsRecovery)
    ));
    drop(room);
    let (room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.log_generation_descriptor("owner")?.next_sequence, "2");
    Ok(())
}

fn name(hash: &[u8; 32]) -> String {
    use std::fmt::Write as _;
    let mut result = String::new();
    for byte in hash {
        write!(result, "{byte:02x}").expect("string formatting");
    }
    result
}
fn in_place_change(manifest: bool) -> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let selected = room.log_generation_descriptor("owner")?;
    let path = if manifest {
        files.room().join(format!("m-{}.json", name(&selected.manifest)))
    } else {
        let mut hash = Sha256::new();
        hash.update(b"breditor/relay-log-file/1\0");
        hash.update(selected.active.as_bytes());
        files.room().join(format!("g-{}.wal", name(&hash.finalize().into())))
    };
    let original = fs::read(&path)?;
    let mut altered = original.clone();
    if manifest {
        let mut value: Value = serde_json::from_slice(&altered)?;
        value["active"]["first"] = 2.into();
        altered = serde_json::to_vec(&value)?;
    } else {
        *altered.last_mut().ok_or("active frame")? ^= 1;
    }
    assert_eq!(altered.len(), original.len());
    fs::write(&path, &altered)?;
    assert!(
        room.log_generation_descriptor("owner").is_err(),
        "Same-length in-place storage changes must fence the real owner"
    );
    fs::write(&path, &original)?;
    assert!(matches!(
        room.log_generation_descriptor("owner"),
        Err(breditor_collab_relay::Error::NeedsRecovery)
    ));
    drop(room);
    let (room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    Ok(())
}
#[test]
fn active_same_length_in_place_change_permanently_fences_until_native_reopen() -> TestResult {
    in_place_change(false)
}
#[test]
fn manifest_same_length_in_place_change_permanently_fences_until_native_reopen() -> TestResult {
    in_place_change(true)
}

#[test]
fn original_reader_cannot_reopen_the_retained_root_as_a_smaller_room() -> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    let selected = room.log_generation_descriptor("owner")?;
    let mut hash = Sha256::new();
    hash.update(b"breditor/relay-log-file/1\0");
    hash.update(selected.root.as_bytes());
    let retained_root = files.room().join(format!("g-{}.wal", name(&hash.finalize().into())));
    drop(room);
    assert!(
        Room::open(&retained_root).is_err(),
        "Original open must refuse a known generation member instead of silently losing its accepted suffix"
    );
    let (room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    Ok(())
}

#[test]
fn copied_generation_root_cannot_impersonate_an_original_room_without_its_metadata() -> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    let selected = room.log_generation_descriptor("owner")?;
    let mut hash = Sha256::new();
    hash.update(b"breditor/relay-log-file/1\0");
    hash.update(selected.root.as_bytes());
    let retained = files.room().join(format!("g-{}.wal", name(&hash.finalize().into())));
    let copied = files.0.join("copied-root.log");
    fs::copy(retained, &copied)?;
    drop(room);
    assert!(
        Room::open(&copied).is_err(),
        "A copied generation root must not impersonate a complete original room and omit its accepted suffix"
    );
    assert_eq!(
        Room::open_log_generations(&files.room())?.0.log_generation_descriptor("owner")?,
        selected
    );
    Ok(())
}

#[cfg(unix)]
#[test]
fn hardlinked_generation_root_still_requires_its_explicit_family_after_the_owner_closes()
-> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let selected = room.log_generation_descriptor("owner")?;
    let mut hash = Sha256::new();
    hash.update(b"breditor/relay-log-file/1\0");
    hash.update(selected.root.as_bytes());
    let retained = files.room().join(format!("g-{}.wal", name(&hash.finalize().into())));
    let alias = files.0.join("outside-root-link.log");
    fs::hard_link(retained, &alias)?;
    drop(room);
    assert!(Room::open(&alias).is_err());
    let (room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    Ok(())
}

#[test]
fn two_automatic_capacity_rotations_preserve_offline_work_and_future_native_undo() -> TestResult {
    let (files, profile, mut room) = setup(3, true, true)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    insert(&mut author, "Before physical capacity ")?;
    let mut through = send(&mut room, &author, "alice", &registration.lease, "0", true)?;
    insert(&mut author, "Old offline ")?;
    let saved = author.checkpoint()?;
    let frame = room.catchup("alice")?;
    for index in 0..8200 {
        room.grant(
            "owner",
            "reader",
            Some(if index % 2 == 0 { Role::Reader } else { Role::Editor }),
        )?;
    }
    let selected = room.log_generation_descriptor("owner")?;
    assert_eq!(selected.next_sequence, "8204");
    assert_eq!(selected.sealed, 2);
    assert!(selected.active.starts_with("auto-"));
    assert_eq!(room.catchup("alice")?, frame);
    drop(room);
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    author = profile.restore("room", &saved)?;
    through = send(&mut room, &author, "alice", &lease, &through, true)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(&mut room, &author, "alice", &lease, &through, true)?;
        let peer = profile.join_frame("room".into(), "902".into(), &room.catchup("owner")?)?;
        assert_eq!(peer.document_json(), author.document_json());
    }
    Ok(())
}

#[test]
fn current_permissions_and_lifetime_ids_refuse_without_moving_the_selected_cut() -> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    let initial = room.log_generation_descriptor("owner")?;
    assert!(room.rotate_log_generation("owner", "empty").is_err());
    assert_eq!(room.log_generation_descriptor("owner")?, initial);
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.grant("owner", "editor", Some(Role::Editor))?;
    let before = room.log_generation_descriptor("owner")?;
    for principal in ["reader", "editor", "unknown"] {
        assert!(room.rotate_log_generation(principal, "two").is_err());
        assert_eq!(room.log_generation_descriptor("owner")?, before);
    }
    for id in ["", ".", "..", "one", "root", "../../other", "space name"] {
        assert!(room.rotate_log_generation("owner", id).is_err());
        assert_eq!(room.log_generation_descriptor("owner")?, before);
    }
    assert!(!files.room().join(".rotation.json").exists());
    let receipt = room.rotate_log_generation("owner", "two")?;
    assert!(!receipt.duplicate);
    room.grant("owner", "reader", None)?;
    assert!(room.log_generation_descriptor("reader").is_err());
    let selected = room.log_generation_descriptor("owner")?;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    assert!(room.rotate_log_generation("owner", "two")?.duplicate);
    Ok(())
}

#[test]
fn unknown_directory_content_and_ambiguous_paths_refuse_before_tail_repair() -> TestResult {
    use std::io::Write;
    for variant in 0..4 {
        let (files, _, mut room) = setup(3, true, true)?;
        room.grant("owner", "reader", Some(Role::Reader))?;
        let selected = room.log_generation_descriptor("owner")?;
        let mut hash = Sha256::new();
        hash.update(b"breditor/relay-log-file/1\0");
        hash.update(selected.active.as_bytes());
        let path = files.room().join(format!("g-{}.wal", name(&hash.finalize().into())));
        drop(room);
        let mut active = fs::OpenOptions::new().append(true).open(&path)?;
        active.write_all(&[1, 2, 3])?;
        active.sync_all()?;
        drop(active);
        let before = fs::read(&path)?;
        let unexpected = files.room().join("unselected-work");
        let open = match variant {
            0 => {
                let mut options = fs::OpenOptions::new();
                options.create_new(true).write(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                let mut file = options.open(&unexpected)?;
                file.write_all(b"unrelated work")?;
                file.sync_all()?;
                files.room()
            }
            1 => {
                fs::create_dir(&unexpected)?;
                files.room()
            }
            2 => files.room().join("."),
            _ => PathBuf::from(format!("{}/", files.room().display())),
        };
        assert!(Room::open_log_generations(&open).is_err(), "variant {variant}");
        assert_eq!(fs::read(&path)?, before, "variant {variant}");
        if variant == 0 {
            assert_eq!(fs::read(&unexpected)?, b"unrelated work");
        }
    }
    Ok(())
}
