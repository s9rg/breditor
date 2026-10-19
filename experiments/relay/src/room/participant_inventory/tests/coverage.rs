//! Complete permanent registrations, not just currently writable or connected participants.
use super::*;
use crate::{RecoveryRegistrationCoverage, ReviewRole, SuggestionRole};

#[test]
fn revoked_and_observer_document_and_review_streams_remain_in_the_inventory() -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    room.enable_review("owner")?;
    room.enable_document_versions("owner")?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    let author = room.register("alice")?;
    let reviewer = room.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
    room.grant("owner", "bob", Some(Role::Reader))?;
    let observer = room.register_observer("bob")?;
    let review_observer =
        room.register_review_observer("bob", ReviewActorId::try_new("bob.readonly")?)?;
    room.grant("owner", "alice", None)?;
    let before = fs::read(directory.0.join("source.log"))?;
    let inventory = room.participant_inventory("owner")?;
    let metadata = inventory.metadata();
    assert_eq!(metadata.writers.len(), 2);
    assert_eq!(metadata.review.as_ref().ok_or("review")?.writers.len(), 2);
    assert!(
        metadata.versions_binding.is_some()
            && metadata.suggestions_binding.is_some()
            && metadata.revisions_binding.is_some()
    );
    assert_eq!(metadata.server_authors.len(), 2);
    assert!(metadata.writers.iter().any(|w| w.clock.writer == author.lease.writer && !w.observer));
    assert!(
        metadata.writers.iter().any(|w| w.clock.writer == observer.lease.writer
            && w.observer
            && w.clock.through == "0")
    );
    let account =
        metadata.accounts.iter().find(|a| a.principal == "alice").ok_or("revoked account")?;
    assert_eq!(account.document_role, None);
    assert_eq!(account.review_role, None);
    assert_eq!(account.suggestion_role, None);
    let credentials = RecoveryRegistrationCredentials {
        documents: vec![
            RecoveryDocumentCredential {
                principal: "alice".into(),
                writer: author.lease.writer.clone(),
                credential: author.credential,
            },
            RecoveryDocumentCredential {
                principal: "bob".into(),
                writer: observer.lease.writer.clone(),
                credential: observer.credential,
            },
        ],
        reviews: vec![
            RecoveryReviewCredential {
                principal: "alice".into(),
                actor: reviewer.lease.actor.as_str().into(),
                credential: reviewer.credential,
            },
            RecoveryReviewCredential {
                principal: "bob".into(),
                actor: review_observer.lease.actor.as_str().into(),
                credential: review_observer.credential,
            },
        ],
    };
    assert!(matches!(
        inventory.verify_registrations(&mut room, "owner", &credentials)?,
        RecoveryRegistrationCoverage::Verified(_)
    ));
    assert!(room.validate_lease("alice", &author.lease).is_err());
    assert!(room.validate_review_lease("alice", &reviewer.lease).is_err());
    room.validate_observer_lease("bob", &observer.lease)?;
    room.validate_review_observer_lease("bob", &review_observer.lease)?;
    assert_eq!(fs::read(directory.0.join("source.log"))?, before);
    Ok(())
}

#[test]
fn missing_review_credential_is_not_substituted_by_a_document_resume_secret() -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    room.enable_review("owner")?;
    let doc = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let inventory = room.participant_inventory("owner")?;
    let mut input = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: doc.lease.writer.clone(),
            credential: doc.credential.clone(),
        }],
        reviews: vec![],
    };
    let RecoveryRegistrationCoverage::Pending { missing } =
        inventory.verify_registrations(&mut room, "owner", &input)?
    else {
        return Err("missing review credential must stay pending".into());
    };
    assert_eq!(
        missing,
        vec![MissingRecoveryRegistration::Review {
            principal: "owner".into(),
            actor: "owner.comments".into()
        }]
    );
    input.reviews.push(RecoveryReviewCredential {
        principal: "owner".into(),
        actor: "owner.comments".into(),
        credential: doc.credential,
    });
    assert!(matches!(
        inventory.verify_registrations(&mut room, "owner", &input),
        Err(crate::Error::Lease)
    ));
    input.reviews[0].credential = review.credential;
    assert!(matches!(
        inventory.verify_registrations(&mut room, "owner", &input)?,
        RecoveryRegistrationCoverage::Verified(_)
    ));
    Ok(())
}

#[test]
fn duplicate_unknown_foreign_and_malformed_protected_records_refuse_without_changing_source()
-> TestResult {
    for case in 0..5 {
        let directory = Directory::new()?;
        let mut room = source(&directory, 1, false, false)?;
        let registration = room.register("owner")?;
        let inventory = room.participant_inventory("owner")?;
        let before = fs::read(directory.0.join("source.log"))?;
        let mut input = RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: registration.lease.writer.clone(),
                credential: registration.credential.clone(),
            }],
            reviews: vec![],
        };
        match case {
            0 => input.documents[0].principal = "foreign".into(),
            1 => input.documents[0].writer = "999".into(),
            2 => input.documents[0].credential = "bad PRIVATE".into(),
            3 => input.documents.push(RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: registration.lease.writer.clone(),
                credential: registration.credential,
            }),
            _ => input.reviews.push(RecoveryReviewCredential {
                principal: "owner".into(),
                actor: "unknown".into(),
                credential: "a".repeat(64),
            }),
        }
        assert!(matches!(
            inventory.verify_registrations(&mut room, "owner", &input),
            Err(crate::Error::Lease)
        ));
        room.validate_lease("owner", &registration.lease)?;
        assert_eq!(fs::read(directory.0.join("source.log"))?, before);
    }
    Ok(())
}

#[test]
fn non_owner_capture_and_credential_checks_refuse_even_for_current_editors() -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    room.grant("owner", "editor", Some(Role::Editor))?;
    let inventory = room.participant_inventory("owner")?;
    let before = fs::read(directory.0.join("source.log"))?;
    assert!(matches!(room.participant_inventory("editor"), Err(crate::Error::Permission)));
    assert!(matches!(
        inventory.verify_registrations(
            &mut room,
            "editor",
            &RecoveryRegistrationCredentials::default()
        ),
        Err(crate::Error::Permission)
    ));
    assert_eq!(fs::read(directory.0.join("source.log"))?, before);
    Ok(())
}
