//! Transport metadata admission is deliberately weaker than actual complete native verification.
use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;

fn selected(json: &str, inventory: &RoomParticipantInventory) -> RoomParticipantInventoryIdentity {
    RoomParticipantInventoryIdentity {
        room: inventory.identity().room,
        sha256: Sha256::digest(json.as_bytes()).into(),
    }
}

#[test]
fn freshly_checksummed_omissions_and_false_prefixes_still_require_native_verification() -> TestResult
{
    for case in 0..4 {
        let directory = Directory::new()?;
        let mut room = source(&directory, 3, true, true)?;
        room.register("owner")?;
        let inventory = room.participant_inventory("owner")?;
        let before = fs::read(directory.0.join("source.log"))?;
        let mut metadata = inventory.metadata();
        match case {
            0 => metadata.writers.clear(),
            1 => {
                metadata.writers[0].clock.prefix_digest =
                    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                        .into();
            }
            2 => metadata.accounts.clear(),
            _ => {
                metadata.schema_fingerprint =
                    "sha256:0000000000000000000000000000000000000000000000000000000000000000"
                        .into();
            }
        }
        let json = serde_json::to_string(&metadata)?;
        let changed = RoomParticipantInventory::from_json(&json, &selected(&json, &inventory))?;
        assert!(changed.verify_native(&mut room, "owner").is_err());
        assert!(
            changed
                .verify_registrations(
                    &mut room,
                    "owner",
                    &RecoveryRegistrationCredentials::default()
                )
                .is_err()
        );
        assert_eq!(fs::read(directory.0.join("source.log"))?, before);
    }
    Ok(())
}

#[test]
fn unknown_fields_noncanonical_bytes_and_wrong_independent_selection_reject() -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    let inventory = room.participant_inventory("owner")?;
    let mut value: Value = serde_json::from_str(inventory.to_json())?;
    value["extra"] = json!(true);
    let extra = value.to_string();
    assert!(RoomParticipantInventory::from_json(&extra, &selected(&extra, &inventory)).is_err());
    let pretty = serde_json::to_string_pretty(&inventory.metadata())?;
    assert!(RoomParticipantInventory::from_json(&pretty, &selected(&pretty, &inventory)).is_err());
    let mut expected = inventory.identity();
    expected.sha256[0] ^= 1;
    assert!(RoomParticipantInventory::from_json(inventory.to_json(), &expected).is_err());
    let oversized = " ".repeat(MAX_ROOM_PARTICIPANT_INVENTORY_BYTES + 1);
    assert!(RoomParticipantInventory::from_json(&oversized, &inventory.identity()).is_err());
    Ok(())
}

#[test]
fn registration_or_grant_changes_stale_the_inventory_but_ephemeral_resume_does_not() -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    let registration = room.register("owner")?;
    let inventory = room.participant_inventory("owner")?;
    let input = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: registration.lease.writer.clone(),
            credential: registration.credential.clone(),
        }],
        reviews: vec![],
    };
    let RecoveryRegistrationCoverage::Verified(proof) =
        inventory.verify_registrations(&mut room, "owner", &input)?
    else {
        return Err("verified".into());
    };
    let resumed = room.resume("owner", &registration.lease.writer, &registration.credential)?;
    proof.check_live(&mut room, "owner")?;
    room.validate_lease("owner", &resumed)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    assert!(inventory.verify_native(&mut room, "owner").is_err());
    assert!(proof.check_live(&mut room, "owner").is_err());
    let current = room.participant_inventory("owner")?;
    room.register_observer("reader")?;
    assert!(current.verify_native(&mut room, "owner").is_err());
    Ok(())
}

#[test]
fn externally_changed_or_uncertain_log_refuses_inventory_and_preserves_the_changed_file()
-> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    let path = directory.0.join("source.log");
    let mut file = fs::OpenOptions::new().append(true).open(&path)?;
    file.write_all(&[1, 2, 3])?;
    file.sync_all()?;
    drop(file);
    let changed = fs::read(&path)?;
    assert!(room.participant_inventory("owner").is_err());
    assert_eq!(fs::read(&path)?, changed);
    assert!(room.backup_identity().is_err());
    Ok(())
}

#[test]
fn original_native_replay_reconstructs_identical_inventory_without_reviving_old_leases()
-> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    room.enable_review("owner")?;
    let registration = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let inventory = room.participant_inventory("owner")?;
    drop(room);
    let (mut reopened, recovery) = Room::open(&directory.0.join("source.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    inventory.verify_native(&mut reopened, "owner")?;
    assert!(reopened.validate_lease("owner", &registration.lease).is_err());
    assert!(reopened.validate_review_lease("owner", &review.lease).is_err());
    assert_eq!(reopened.participant_inventory("owner")?.to_json(), inventory.to_json());
    Ok(())
}
