use super::*;
use crate::{Admission, Role};
use breditor_collab_feasibility::rich_replica::{Command, RichReplica, actions::InsertText};

fn groups(owner: &RichReplica, after: &str, atomic: bool) -> TestResult<(String, Vec<String>)> {
    let packet: Value = serde_json::from_str(&if atomic {
        owner.writer_groups_v2_guarded(&owner.observe()?, after)?
    } else {
        owner.writer_groups_guarded(&owner.observe()?, after)?
    })?;
    Ok((
        packet["through"].as_str().ok_or("through")?.into(),
        packet["groups"]
            .as_array()
            .ok_or("groups")?
            .iter()
            .map(|g| g.as_str().map(str::to_owned).ok_or("group".into()))
            .collect::<TestResult<_>>()?,
    ))
}

fn flush_client(
    room: &mut Room,
    client: &RichReplica,
    lease: &crate::Lease,
    after: &str,
    atomic: bool,
) -> TestResult<String> {
    let (next, packets) = groups(client, after, atomic)?;
    for packet in packets {
        assert!(matches!(room.admit("alice", lease, &packet)?, Admission::Durable(_)));
    }
    assert_eq!(room.replica.document_json(), client.document_json());
    assert!(room.replica.document_json().contains("Peer preserved"));
    Ok(next)
}

fn accepted_peer(
    profile: &SharedRichProfile,
    room: &mut Room,
    registration: &crate::Registration,
    atomic: bool,
) -> TestResult {
    let mut peer = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("revoked")?,
    )?;
    peer.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Peer preserved ".into(),
    })])?;
    for packet in groups(&peer, "0", atomic)?.1 {
        assert!(matches!(
            room.admit("revoked", &registration.lease, &packet)?,
            Admission::Durable(_)
        ));
    }
    room.grant("owner", "revoked", None)?;
    Ok(())
}

#[test]
fn all_ten_explicit_profiles_and_transports_restore_receipts_ids_and_future_offline_history()
-> TestResult {
    for atomic in [false, true] {
        for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
            let directory = Directory::new()?;
            let (profile, mut source) = start(&directory, version, standard, atomic)?;
            source.grant("owner", "alice", Some(Role::Editor))?;
            source.grant("owner", "revoked", Some(Role::Editor))?;
            let registration = source.register("alice")?;
            let revoked = source.register("revoked")?;
            accepted_peer(&profile, &mut source, &revoked, atomic)?;
            let mut client = profile.join_frame(
                "room".into(),
                registration.lease.writer.clone(),
                &source.catchup("alice")?,
            )?;
            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Before backup 🙂 ".into(),
            })])?;
            let (through, first) = groups(&client, "0", atomic)?;
            let Admission::Durable(receipt) =
                source.admit("alice", &registration.lease, &first[0])?
            else {
                return Err("first receipt".into());
            };
            let before = source.replica.document_json().to_owned();
            let asset_binding = source.asset_binding.clone();
            let clock = source.writer_clock("alice", &registration.lease.writer)?;
            let archive = source.export_backup()?;
            let identity = source.backup_identity()?;
            let expected_profile = match version {
                1 => crate::AtomicTransportProfile::Original,
                2 => crate::AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
                _ => crate::AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
            };
            assert_eq!(identity.profile, expected_profile);
            let exact = fs::read(directory.path("source.log"))?;
            // This offline change is intentionally not in the accepted server archive.
            client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Offline retained ".into(),
            })])?;
            let journal = client.checkpoint()?;
            client = profile.restore("room", &journal)?;
            drop(source);
            let loaded = RoomBackup::from_bytes(&archive.to_bytes())?;
            let mut restored = Room::restore_backup(
                &directory.path("target.log"),
                &loaded,
                &identity,
                RoomRecoveryPolicy::HostReacquired,
            )?;
            assert_eq!(fs::read(directory.path("target.log"))?, exact);
            assert_eq!(restored.writer_transport_version(), if atomic { 2 } else { 1 });
            assert_eq!(restored.replica.document_json(), before);
            assert_eq!(restored.asset_binding, asset_binding);
            assert_eq!(restored.writer_clock("alice", &registration.lease.writer)?, clock);
            assert!(restored.validate_lease("alice", &registration.lease).is_err());
            assert!(
                restored.resume("revoked", &revoked.lease.writer, &revoked.credential).is_err()
            );
            assert!(
                restored
                    .resume("owner", &registration.lease.writer, &registration.credential)
                    .is_err()
            );
            let lease =
                restored.resume("alice", &registration.lease.writer, &registration.credential)?;
            let Admission::Durable(retry) = restored.admit("alice", &lease, &first[0])? else {
                return Err("duplicate receipt".into());
            };
            assert!(retry.duplicate);
            assert_eq!(retry.sequence, receipt.sequence);
            assert_eq!(retry.receipt, receipt.receipt);
            assert_eq!(fs::read(directory.path("target.log"))?, exact);
            let mut through = flush_client(&mut restored, &client, &lease, &through, atomic)?;
            for redo in [false, true, false, false, true, true] {
                if redo {
                    client.redo()?;
                } else {
                    client.undo()?;
                }
                through = flush_client(&mut restored, &client, &lease, &through, atomic)?;
            }
            let next = restored.register("alice")?;
            assert_eq!(next.lease.writer, "4");
            let final_archive = restored.export_backup()?;
            drop(restored);
            let (mut reopened, recovery) = Room::open(&directory.path("target.log"))?;
            assert_eq!(recovery.truncated_bytes, 0);
            assert_eq!(reopened.export_backup()?.to_bytes(), final_archive.to_bytes());
        }
    }
    Ok(())
}
