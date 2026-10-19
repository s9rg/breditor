//! Tests use only actual native room/profile/registration owners, not a second protocol model.
use super::*;
use crate::{AtomicTransportProfile, Role, Room};
use breditor_collab_feasibility::{review::ReviewActorId, rich_replica::SharedRichProfile};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
mod coverage;
mod native_verification;
mod prefixes;
mod server_authors;

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Directory {
    fn new() -> TestResult<Self> {
        let path = std::env::temp_dir()
            .join(format!("breditor-participant-inventory-{}", crate::credentials::issue()?));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn source(directory: &Directory, language: u32, standard: bool, atomic: bool) -> TestResult<Room> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/participant-inventory","version":1},"extensions":[]}).to_string();
    let profile = match (language, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("fixture profile".into()),
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/participant-inventory","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let path = directory.0.join("source.log");
    Ok(if atomic {
        Room::create_atomic_transport_v2(
            &path,
            &configuration,
            &document,
            "owner",
            match language {
                1 => AtomicTransportProfile::Original,
                2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
                _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
            },
        )?
    } else {
        match (language, standard) {
            (1, false) => Room::create(&path, &configuration, &document, "owner")?,
            (2, false) => Room::create_structural_v2(&path, &configuration, &document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(&path, &configuration, &document, "owner")?
            }
            (3, false) => Room::create_layout_v3(&path, &configuration, &document, "owner")?,
            _ => Room::create_standard_layout_v3(&path, &configuration, &document, "owner")?,
        }
    })
}

#[test]
fn all_original_profiles_and_transports_capture_empty_registered_prefixes() -> TestResult {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let directory = Directory::new()?;
            let mut room = source(&directory, language, standard, atomic)?;
            let registered = room.register("owner")?;
            let inventory = room.participant_inventory("owner")?;
            assert_eq!(inventory.metadata.rich_language, language);
            assert_eq!(inventory.metadata.writers.len(), 1);
            assert_eq!(inventory.metadata.writers[0].clock.writer, registered.lease.writer);
            assert_eq!(inventory.metadata.writers[0].clock.through, "0");
            assert_eq!(inventory.metadata.server_authors.len(), 1);
            let copy =
                RoomParticipantInventory::from_json(inventory.to_json(), &inventory.identity())?;
            copy.verify_native(&mut room, "owner")?;
            room.validate_lease("owner", &registered.lease)?;
        }
    }
    Ok(())
}

#[test]
fn missing_protected_records_remain_pending_and_matching_secrets_do_not_replace_leases()
-> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    room.enable_review("owner")?;
    let document = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let inventory = room.participant_inventory("owner")?;
    assert!(
        matches!(inventory.verify_registrations(&mut room,"owner",&RecoveryRegistrationCredentials::default())?,RecoveryRegistrationCoverage::Pending{missing} if missing.len()==2)
    );
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
    let before = fs::read(directory.0.join("source.log"))?;
    let RecoveryRegistrationCoverage::Verified(proof) =
        inventory.verify_registrations(&mut room, "owner", &input)?
    else {
        return Err("complete credentials".into());
    };
    assert_eq!(proof.identity(), inventory.identity());
    proof.check_live(&mut room, "owner")?;
    room.validate_lease("owner", &document.lease)?;
    room.validate_review_lease("owner", &review.lease)?;
    assert_eq!(fs::read(directory.0.join("source.log"))?, before);
    for secret in [
        &input.documents[0].credential,
        &input.reviews[0].credential,
        &document.lease.token,
        &review.lease.token,
    ] {
        assert!(!inventory.to_json().contains(secret));
    }
    Ok(())
}
