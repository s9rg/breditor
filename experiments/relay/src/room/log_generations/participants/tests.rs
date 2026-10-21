//! Actual native/physical owners: transport checksums never substitute for native verification.
use super::*;
use crate::room::log_generations::tests::setup_profile;
use crate::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    Role, RoomParticipantInventory, RoomParticipantInventoryIdentity,
};
use breditor_collab_feasibility::review::ReviewActorId;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, io::Write};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn selected(
    json: &str,
    inventory: &ServerLogGenerationParticipantInventory,
) -> ServerLogGenerationParticipantIdentity {
    ServerLogGenerationParticipantIdentity {
        source: inventory.identity().source,
        sha256: Sha256::digest(json.as_bytes()).into(),
    }
}

#[test]
fn all_forty_native_family_choices_keep_complete_registrations_at_the_exact_archive_cut()
-> TestResult {
    let mut cases = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for (documents, reviews) in [(false, false), (true, false), (false, true), (true, true)]
            {
                let (_files, mut room, _) = setup_profile(version, standard, atomic)?;
                room.enable_review("owner")?;
                room.enable_document_versions("owner")?;
                if atomic {
                    room.enable_document_suggestions("owner")?;
                    room.enable_document_suggestion_revisions("owner")?;
                }
                let document = room.register("owner")?;
                let review = room.register_review("owner", ReviewActorId::try_new("comments")?)?;
                if documents {
                    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
                }
                if reviews {
                    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
                }
                room.rotate_log_generation("owner", "two")?;
                let before = room.export_log_generation_backup("owner")?.to_bytes();
                let inventory = room.log_generation_participant_inventory("owner")?;
                let metadata = inventory.metadata();
                assert_eq!(
                    metadata.source,
                    room.export_log_generation_backup("owner")?.info().identity
                );
                assert_eq!(metadata.native.room, metadata.source.source);
                assert_eq!(metadata.native.rich_language, version);
                assert_eq!(metadata.native.writers.len(), 1);
                assert_eq!(metadata.native.writers[0].clock.writer, document.lease.writer);
                assert_eq!(metadata.native.review.ok_or("review namespace")?.writers.len(), 1);
                assert_eq!(metadata.native.server_authors.len(), if atomic { 2 } else { 1 });
                let copy = ServerLogGenerationParticipantInventory::from_json(
                    inventory.to_json(),
                    &inventory.identity(),
                )?;
                let input = RecoveryRegistrationCredentials {
                    documents: vec![RecoveryDocumentCredential {
                        principal: "owner".into(),
                        writer: document.lease.writer.clone(),
                        credential: document.credential,
                    }],
                    reviews: vec![RecoveryReviewCredential {
                        principal: "owner".into(),
                        actor: review.lease.actor.as_str().into(),
                        credential: review.credential,
                    }],
                };
                let GenerationRecoveryRegistrationCoverage::Verified(proof) =
                    copy.verify_registrations(&mut room, "owner", &input)?
                else {
                    return Err("complete native protected set".into());
                };
                proof.check_live(&mut room, "owner")?;
                room.validate_lease("owner", &document.lease)?;
                room.validate_review_lease("owner", &review.lease)?;
                assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), before);
                assert!(room.participant_inventory("owner").is_err());
                assert!(
                    RoomParticipantInventory::from_json(
                        copy.to_json(),
                        &RoomParticipantInventoryIdentity {
                            room: copy.identity().source.source,
                            sha256: Sha256::digest(copy.to_json()).into(),
                        }
                    )
                    .is_err()
                );
                cases += 1;
            }
        }
    }
    assert_eq!(cases, 40);
    Ok(())
}

#[test]
fn checksum_valid_missing_or_divergent_native_state_never_becomes_a_registration_proof()
-> TestResult {
    let (_files, mut room, _) = setup_profile(3, true, true)?;
    room.enable_review("owner")?;
    room.register("owner")?;
    room.register_review("owner", ReviewActorId::try_new("comments")?)?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let before = room.export_log_generation_backup("owner")?.to_bytes();
    for case in 0..6 {
        let mut metadata = inventory.metadata();
        match case {
            0 => metadata.native.writers.clear(),
            1 => metadata.native.accounts.clear(),
            2 => metadata.native.review = None,
            3 => metadata.native.server_authors.clear(),
            4 => metadata.native.writers[0].clock.through = "999".into(),
            _ => metadata.native.schema_fingerprint = format!("sha256:{}", "f".repeat(64)),
        }
        let json = serde_json::to_string(&metadata)?;
        let forged = ServerLogGenerationParticipantInventory::from_json(
            &json,
            &selected(&json, &inventory),
        )?;
        assert!(forged.verify_native(&mut room, "owner").is_err());
        assert!(
            forged
                .verify_registrations(
                    &mut room,
                    "owner",
                    &RecoveryRegistrationCredentials::default()
                )
                .is_err()
        );
    }
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), before);
    Ok(())
}

#[test]
fn the_detached_native_component_cannot_bypass_original_storage_proof_requirements() -> TestResult {
    let (_files, mut room, _) = setup_profile(3, true, true)?;
    room.register("owner")?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let native = inventory.metadata().native;
    let json = serde_json::to_string(&native)?;
    let original = RoomParticipantInventory::from_json(
        &json,
        &RoomParticipantInventoryIdentity {
            room: native.room,
            sha256: Sha256::digest(json.as_bytes()).into(),
        },
    )?;
    assert!(original.verify_native(&mut room, "owner").is_err());
    assert!(
        original
            .verify_registrations(&mut room, "owner", &RecoveryRegistrationCredentials::default())
            .is_err()
    );
    inventory.verify_native(&mut room, "owner")?;
    Ok(())
}

#[test]
fn physical_rotation_stales_the_proof_even_without_a_new_native_event_but_resume_does_not()
-> TestResult {
    let (_files, mut room, _) = setup_profile(3, true, true)?;
    let document = room.register("owner")?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let input = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: document.lease.writer.clone(),
            credential: document.credential.clone(),
        }],
        reviews: vec![],
    };
    let GenerationRecoveryRegistrationCoverage::Verified(proof) =
        inventory.verify_registrations(&mut room, "owner", &input)?
    else {
        return Err("complete registration proof".into());
    };
    room.resume("owner", &document.lease.writer, &document.credential)?;
    proof.check_live(&mut room, "owner")?;
    room.rotate_log_generation("owner", "two")?;
    let later = room.log_generation_participant_inventory("owner")?;
    assert_eq!(inventory.metadata().native, later.metadata().native);
    assert_ne!(inventory.identity().source.manifest, later.identity().source.manifest);
    assert!(proof.check_live(&mut room, "owner").is_err());
    assert!(inventory.verify_native(&mut room, "owner").is_err());
    Ok(())
}

#[test]
fn unpublished_stage_bytes_also_bind_the_complete_source_not_just_manifest_or_native_clocks()
-> TestResult {
    use std::os::unix::fs::OpenOptionsExt;
    let (files, mut room, _) = setup_profile(3, true, true)?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let stage = files.room().join(format!(".stage-{}", "a".repeat(64)));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(stage)?;
    file.write_all(b"unpublished retained work")?;
    file.sync_all()?;
    let later = room.log_generation_participant_inventory("owner")?;
    assert_eq!(inventory.metadata().native, later.metadata().native);
    assert_eq!(inventory.identity().source.manifest, later.identity().source.manifest);
    assert_ne!(inventory.identity().source.archive_sha256, later.identity().source.archive_sha256);
    assert!(inventory.verify_native(&mut room, "owner").is_err());
    Ok(())
}

#[test]
fn ambiguous_family_selection_and_encoding_never_admit_a_partial_inventory() -> TestResult {
    let (_files, mut room, _) = setup_profile(3, true, true)?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let mut value: Value = serde_json::from_str(inventory.to_json())?;
    value["extra"] = Value::Bool(true);
    let json = value.to_string();
    assert!(
        ServerLogGenerationParticipantInventory::from_json(&json, &selected(&json, &inventory))
            .is_err()
    );
    let pretty = serde_json::to_string_pretty(&inventory.metadata())?;
    assert!(
        ServerLogGenerationParticipantInventory::from_json(&pretty, &selected(&pretty, &inventory))
            .is_err()
    );
    for case in 0..6 {
        let mut metadata = inventory.metadata();
        match case {
            0 => metadata.format = "breditor/room-participant-inventory".into(),
            1 => metadata.format_version = 2,
            2 => metadata.source.manifest[0] ^= 1,
            3 => metadata.source.archive_sha256[0] ^= 1,
            4 => metadata.native.room.owner = "other".into(),
            _ => metadata.native.format_version = 2,
        }
        let json = serde_json::to_string(&metadata)?;
        assert!(
            ServerLogGenerationParticipantInventory::from_json(&json, &selected(&json, &inventory))
                .is_err()
        );
    }
    let mut expected = inventory.identity();
    expected.sha256[0] ^= 1;
    assert!(
        ServerLogGenerationParticipantInventory::from_json(inventory.to_json(), &expected).is_err()
    );
    let oversized = " ".repeat(MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES + 1);
    assert!(
        ServerLogGenerationParticipantInventory::from_json(&oversized, &inventory.identity())
            .is_err()
    );
    room.grant("owner", "editor", Some(Role::Editor))?;
    assert!(matches!(room.log_generation_participant_inventory("editor"), Err(Error::Permission)));
    Ok(())
}
