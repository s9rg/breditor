//! Public complete-file archive laws. Transport admission is intentionally not native activation.
use super::{TestResult, insert, send, setup};
use breditor_collab_relay::{Role, RoomBackup, RoomBackupIdentity, ServerLogGenerationBackup};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Write},
};
const MAGIC: &[u8] = b"BREDITOR-RELAY-GENERATIONS1\n";
const PREFIX: usize = MAGIC.len() + 4 + 32;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Part {
    name: String,
    offset: u64,
    bytes: u64,
    sha256: [u8; 32],
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Header {
    format: String,
    format_version: u32,
    source: RoomBackupIdentity,
    manifest: [u8; 32],
    files: Vec<Part>,
}
fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn archive_with_owner(bytes: &[u8], owner: &str) -> TestResult<Vec<u8>> {
    let (mut header, files) = split(bytes)?;
    header.source.owner = owner.into();
    framed(header, files)
}
fn envelope(header: &Header, body: &[u8]) -> TestResult<Vec<u8>> {
    let encoded = serde_json::to_vec(header)?;
    let mut bytes = MAGIC.to_vec();
    bytes.extend_from_slice(&u32::try_from(encoded.len())?.to_be_bytes());
    bytes.extend_from_slice(&sha(&encoded));
    bytes.extend(encoded);
    bytes.extend(body);
    Ok(bytes)
}

#[test]
fn incomplete_envelopes_duplicate_names_and_checksum_valid_range_ambiguity_never_admit_partial_archives()
-> TestResult {
    let (_files, _, mut authority) = setup(3, true, true)?;
    let bytes = authority.export_log_generation_backup("owner")?.to_bytes();
    let size =
        usize::try_from(u32::from_be_bytes(bytes[MAGIC.len()..MAGIC.len() + 4].try_into()?))?;
    for end in [0, MAGIC.len() - 1, PREFIX - 1, PREFIX + size - 1, bytes.len() - 1] {
        assert!(ServerLogGenerationBackup::from_bytes(&bytes[..end]).is_err(), "cut {end}");
    }
    let mut trailing = bytes.clone();
    trailing.push(0);
    assert!(ServerLogGenerationBackup::from_bytes(&trailing).is_err());
    let body = &bytes[PREFIX + size..];
    for variant in 0..5 {
        let (mut header, _) = split(&bytes)?;
        match variant {
            0 => {
                header.files[1].name = header.files[0].name.clone();
            }
            1 => {
                header.files[1].offset += 1;
            }
            2 => {
                header.files[1].offset -= 1;
            }
            3 => {
                header.files[0].bytes = u64::MAX;
            }
            _ => {
                header.files.swap(0, 1);
            }
        }
        assert!(
            ServerLogGenerationBackup::from_bytes(&envelope(&header, body)?).is_err(),
            "range {variant}"
        );
    }
    Ok(())
}
fn split(bytes: &[u8]) -> TestResult<(Header, BTreeMap<String, Vec<u8>>)> {
    assert!(bytes.starts_with(MAGIC));
    let size =
        usize::try_from(u32::from_be_bytes(bytes[MAGIC.len()..MAGIC.len() + 4].try_into()?))?;
    let header: Header = serde_json::from_slice(&bytes[PREFIX..PREFIX + size])?;
    let body = &bytes[PREFIX + size..];
    let files = header
        .files
        .iter()
        .map(|part| {
            let begin = usize::try_from(part.offset)?;
            let end = usize::try_from(part.offset + part.bytes)?;
            Ok((part.name.clone(), body[begin..end].to_vec()))
        })
        .collect::<TestResult<_>>()?;
    Ok((header, files))
}
fn framed(mut header: Header, files: BTreeMap<String, Vec<u8>>) -> TestResult<Vec<u8>> {
    let mut body = Vec::new();
    header.files.clear();
    for (name, bytes) in files {
        header.files.push(Part {
            name,
            offset: body.len() as u64,
            bytes: bytes.len() as u64,
            sha256: sha(&bytes),
        });
        body.extend(bytes);
    }
    let encoded = serde_json::to_vec(&header)?;
    let mut output = MAGIC.to_vec();
    output.extend_from_slice(&u32::try_from(encoded.len())?.to_be_bytes());
    output.extend_from_slice(&sha(&encoded));
    output.extend(encoded);
    output.extend(body);
    Ok(output)
}

#[test]
fn complete_archives_keep_all_files_and_exact_bytes_without_moving_any_native_cut_in_ten_modes()
-> TestResult {
    let mut cases = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (files, profile, mut room) = setup(version, standard, atomic)?;
            room.grant("owner", "alice", Some(Role::Editor))?;
            let registered = room.register("alice")?;
            let mut author = profile.join_frame(
                "room".into(),
                registered.lease.writer.clone(),
                &room.catchup("alice")?,
            )?;
            insert(&mut author, "Retained before archive ")?;
            let mut through = send(&mut room, &author, "alice", &registered.lease, "0", atomic)?;
            room.rotate_log_generation("owner", "two")?;
            room.grant("owner", "reader", Some(Role::Reader))?;
            room.rotate_log_generation("owner", "three")?;
            let before = room.log_generation_descriptor("owner")?;
            let native = room.catchup("owner")?;
            let archive = room.export_log_generation_backup("owner")?;
            let bytes = archive.to_bytes();
            assert_eq!(archive.info().identity.source.records.to_string(), before.next_sequence);
            assert_eq!(archive.info().identity.manifest, before.manifest);
            let (_, parts) = split(&bytes)?;
            assert!(!parts.contains_key(".owner"));
            assert_eq!(parts.len() + 1, fs::read_dir(files.room())?.count());
            for (name, data) in parts {
                assert_eq!(fs::read(files.room().join(name))?, data);
            }
            assert!(RoomBackup::from_bytes(&bytes).is_err());
            assert_eq!(ServerLogGenerationBackup::from_bytes(&bytes)?.to_bytes(), bytes);
            assert_eq!(
                ServerLogGenerationBackup::from_owned_bytes(bytes.clone())?.to_bytes(),
                bytes
            );
            let mut streamed = Vec::new();
            archive.write_to(&mut streamed)?;
            assert_eq!(streamed, bytes);
            assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), bytes);
            assert_eq!(room.log_generation_descriptor("owner")?, before);
            assert_eq!(room.catchup("owner")?, native);
            // Capture may read the active inode; its next append must still use the exact end.
            insert(&mut author, "After archive ")?;
            through = send(&mut room, &author, "alice", &registered.lease, &through, atomic)?;
            for redo in [false, true] {
                assert!(if redo { author.redo()? } else { author.undo()? });
                through = send(&mut room, &author, "alice", &registered.lease, &through, atomic)?;
            }
            let selected = room.log_generation_descriptor("owner")?;
            drop(room);
            assert_eq!(
                breditor_collab_relay::Room::open_log_generations(&files.room())?
                    .0
                    .log_generation_descriptor("owner")?,
                selected
            );
            cases += 1;
        }
    }
    assert_eq!(cases, 10);
    Ok(())
}

#[test]
fn initial_empty_active_file_and_unpublished_bytes_are_preserved_not_admitted_as_history()
-> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    let before = room.log_generation_descriptor("owner")?;
    let path = files.room().join(format!(".stage-{}", "a".repeat(64)));
    let mut options = fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path)?;
    file.write_all(b"{unpublished partial control")?;
    file.sync_all()?;
    drop(file);
    let archive = room.export_log_generation_backup("owner")?;
    let (_, parts) = split(&archive.to_bytes())?;
    assert_eq!(
        parts.get(path.file_name().ok_or("filename")?.to_str().ok_or("utf8")?).ok_or("stage")?,
        b"{unpublished partial control"
    );
    assert_eq!(parts.len(), 6);
    assert!(parts.values().any(Vec::is_empty));
    assert_eq!(room.log_generation_descriptor("owner")?, before);
    ServerLogGenerationBackup::from_owned_bytes(archive.to_bytes())?;
    Ok(())
}

#[test]
fn maximum_layout_can_export_complete_history_under_a_bounded_fd_budget() -> TestResult {
    let (_files, _, mut authority) = setup(3, true, true)?;
    for index in 0..62 {
        authority.grant("owner", "reader", Some(Role::Reader))?;
        authority.rotate_log_generation("owner", &format!("maximum-{index}"))?;
    }
    let selected = authority.log_generation_descriptor("owner")?;
    assert_eq!(selected.sealed, 62);
    assert_eq!(selected.next_sequence, "63");
    let backup = authority.export_log_generation_backup("owner")?;
    assert_eq!(backup.info().identity.source.records, 63);
    ServerLogGenerationBackup::from_owned_bytes(backup.to_bytes())?;
    assert_eq!(authority.log_generation_descriptor("owner")?, selected);
    Ok(())
}

#[test]
fn checksum_valid_missing_extra_changed_and_pending_sections_refuse_as_a_whole() -> TestResult {
    let (_files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    let bytes = room.export_log_generation_backup("owner")?.to_bytes();
    for variant in 0..10 {
        let (mut header, mut files) = split(&bytes)?;
        match variant {
            0 => {
                files.remove(".ready.json").ok_or("ready")?;
            }
            1 => {
                files.insert(".owner".into(), b"untrusted instance".to_vec());
            }
            2 => {
                files.insert(".rotation.json".into(), b"{}".to_vec());
            }
            3 => {
                files.insert("unrelated-work".into(), b"preserve this".to_vec());
            }
            4 => {
                header.source.records += 1;
            }
            5 => {
                header.manifest[0] ^= 1;
            }
            6 => {
                header.format_version = 2;
            }
            7 => {
                let key = files.keys().find(|key| key.starts_with("m-")).ok_or("manifest")?.clone();
                files.get_mut(&key).ok_or("manifest")?.push(b' ');
            }
            8 => {
                let active =
                    files.values_mut().find(|bytes| bytes.is_empty()).ok_or("empty active")?;
                active.extend([1, 2, 3]);
            }
            _ => {
                let closed = files
                    .iter_mut()
                    .find(|(name, bytes)| name.starts_with("g-") && !bytes.is_empty())
                    .ok_or("closed")?
                    .1;
                *closed.last_mut().ok_or("record")? ^= 1;
            }
        }
        let forged = framed(header, files)?;
        assert!(ServerLogGenerationBackup::from_bytes(&forged).is_err(), "variant {variant}");
    }
    Ok(())
}

struct BrokenWriter;
impl Write for BrokenWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::other("fixture destination unavailable"))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn archive_permissions_and_detached_write_errors_do_not_change_the_live_owner() -> TestResult {
    let (_files, _, mut room) = setup(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let before = room.log_generation_descriptor("owner")?;
    for principal in ["reader", "unknown"] {
        assert!(room.export_log_generation_backup(principal).is_err());
    }
    let archive = room.export_log_generation_backup("owner")?;
    assert!(archive.write_to(&mut BrokenWriter).is_err());
    assert_eq!(room.log_generation_descriptor("owner")?, before);
    Ok(())
}
