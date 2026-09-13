use super::*;
use crate::codec::{LocalLogStorageAttemptPreparationError, LocalLogStorageRootPublicationPlanV3};
use crate::codec::{
    LocalLogStorageAttemptTerminalAttestationKind as TerminalKind,
    LocalLogStorageAttemptTransitionError as TransitionError,
    LocalLogStorageRootPublicationAttestationV3 as Attestation,
};
use crate::local_log::LocalLogStorageAttemptRequestId;

#[path = "local_log_storage_root_readback_v3_tests.rs"]
mod readback;

fn publication_plan(
    fixture: &StorageV3Fixture,
) -> Result<LocalLogStorageRootPublicationPlanV3, Box<dyn std::error::Error>> {
    let codec = fixture.root_codec();
    Ok(codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &codec.decode_root(&fixture.encoded_root()?)?,
    )?)
}

#[test]
fn dispatch_is_exact_one_shot_and_redacted() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let reference = publication_plan(&fixture)?;
    let mut attempt = publication_plan(&fixture)?.begin_attempt();
    let other = publication_plan(&fixture)?.begin_attempt();
    assert_ne!(attempt.attempt_id(), other.attempt_id());
    assert!(!attempt.request_issued());
    assert!(attempt.plan().same_plan_as(&reference));
    let attempt_id = attempt.attempt_id().clone();
    let request_id = {
        let request = attempt.adapter_request()?;
        assert_eq!(request.candidate_json(), fixture.encoded_root()?);
        assert_eq!(request.candidate_binding(), reference.candidate_binding());
        assert_eq!(request.request_id().attempt_id(), &attempt_id);
        assert!(!format!("{request:?}").contains("STORAGEV3PAYLOADSENTINEL"));
        request.request_id().clone()
    };
    assert!(attempt.request_issued());
    assert!(matches!(attempt.adapter_request(), Err(TransitionError::RequestAlreadyBorrowed)));
    assert!(!format!("{attempt:?}").contains("STORAGEV3PAYLOADSENTINEL"));
    let result =
        attempt.observe_terminal_attestation(Attestation::publication_completed(&request_id))?;
    assert_eq!(result.kind(), TerminalKind::PublicationCompleted);
    assert_eq!(result.attempt_id(), &attempt_id);
    assert_eq!(result.request_id(), Some(&request_id));
    assert!(result.plan().same_plan_as(&reference));
    assert!(!format!("{result:?}").contains("STORAGEV3PAYLOADSENTINEL"));
    Ok(())
}

#[test]
fn terminal_categories_retain_plan_and_pre_or_post_egress_correlation() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let reference = publication_plan(&fixture)?;
    for issued in [false, true] {
        let mut attempt = publication_plan(&fixture)?.begin_attempt();
        let request_id =
            if issued { Some(attempt.adapter_request()?.request_id().clone()) } else { None };
        let attestation = Attestation::not_attempted(attempt.attempt_id());
        let result = attempt.observe_terminal_attestation(attestation)?;
        assert_eq!(result.kind(), TerminalKind::NotAttempted);
        assert_eq!(result.request_id(), request_id.as_ref());
        assert!(result.plan().same_plan_as(&reference));
    }
    let mut attempt = publication_plan(&fixture)?.begin_attempt();
    let id = attempt.adapter_request()?.request_id().clone();
    let result = attempt.observe_terminal_attestation(Attestation::transaction_aborted(&id))?;
    assert_eq!(result.kind(), TerminalKind::TransactionAborted);
    assert_eq!(result.request_id(), Some(&id));
    assert!(result.plan().same_plan_as(&reference));
    Ok(())
}

#[test]
fn crosswired_terminal_claim_returns_both_inputs_without_unlocking_request() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let reference = publication_plan(&fixture)?;
    for issued in [false, true] {
        for kind in [
            TerminalKind::PublicationCompleted,
            TerminalKind::TransactionAborted,
            TerminalKind::NotAttempted,
        ] {
            let mut first = publication_plan(&fixture)?.begin_attempt();
            let first_id = first.attempt_id().clone();
            if issued {
                let _ = first.adapter_request()?;
            }
            let mut other = publication_plan(&fixture)?.begin_attempt();
            let other_request = other.adapter_request()?.request_id().clone();
            let claim = match kind {
                TerminalKind::PublicationCompleted => {
                    Attestation::publication_completed(&other_request)
                }
                TerminalKind::TransactionAborted => {
                    Attestation::transaction_aborted(&other_request)
                }
                TerminalKind::NotAttempted => Attestation::not_attempted(other.attempt_id()),
            };
            let failure = first
                .observe_terminal_attestation(claim)
                .err()
                .ok_or("accepted foreign attempt")?;
            assert_eq!(failure.error(), TransitionError::AttemptIdMismatch);
            assert!(!format!("{failure:?}").contains("STORAGEV3PAYLOADSENTINEL"));
            let (mut first, claim, error) = failure.into_parts();
            assert_eq!(error, TransitionError::AttemptIdMismatch);
            assert_eq!(first.attempt_id(), &first_id);
            assert_eq!(first.request_issued(), issued);
            assert!(first.plan().same_plan_as(&reference));
            if issued {
                assert!(matches!(
                    first.adapter_request(),
                    Err(TransitionError::RequestAlreadyBorrowed)
                ));
            }
            let result = other.observe_terminal_attestation(claim)?;
            assert_eq!(result.kind(), kind);
        }
    }
    Ok(())
}

#[test]
fn internal_crosswired_request_tokens_cannot_clear_uncertainty() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    for issued in [false, true] {
        let mut attempt = publication_plan(&fixture)?.begin_attempt();
        let actual =
            if issued { Some(attempt.adapter_request()?.request_id().clone()) } else { None };
        // Private token factory simulates corruption impossible through the public API.
        let wrong = LocalLogStorageAttemptRequestId::new(attempt.attempt_id());
        for rollback in [false, true] {
            let claim = if rollback {
                Attestation::transaction_aborted(&wrong)
            } else {
                Attestation::publication_completed(&wrong)
            };
            let failure = attempt
                .observe_terminal_attestation(claim)
                .err()
                .ok_or("accepted wrong request")?;
            assert_eq!(
                failure.error(),
                if issued {
                    TransitionError::RequestIdMismatch
                } else {
                    TransitionError::RequestNotIssued
                }
            );
            let (retained, claim, _) = failure.into_parts();
            assert_eq!(claim.request_id(), Some(&wrong));
            assert_eq!(retained.request_issued(), issued);
            attempt = retained;
        }
        let claim = match actual {
            Some(id) => Attestation::publication_completed(&id),
            None => Attestation::not_attempted(attempt.attempt_id()),
        };
        let _ = attempt.observe_terminal_attestation(claim)?;
    }
    Ok(())
}

#[test]
fn preparation_retains_exact_v3_binding_and_hides_payloads() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let json = fixture.encoded_root()?;
    let root = codec.decode_root(&json)?;
    let plan = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    assert_eq!(plan.candidate_json_bytes(), json.len());
    assert_eq!(plan.schema_binding(), root.schema_binding());
    assert_eq!(
        plan.candidate_receipt().database_incarnation_id(),
        &fixture.database_incarnation_id
    );
    assert_eq!(plan.candidate_receipt().scope_incarnation_id(), &fixture.scope_incarnation_id);
    assert_eq!(plan.candidate_binding().active_generation().frame(), root.active_frame());
    assert_eq!(plan.candidate_receipt().selection_kind(), LocalLogStorageSelectionKind::Root);
    let debug = format!("{plan:?}");
    assert!(!debug.contains("STORAGEV3PAYLOADSENTINEL"));
    assert!(!debug.contains(root.checkpoint_json()));
    assert_eq!(codec.encode_root(&root)?, json);
    let repeated = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    assert!(plan.same_plan_as(&repeated));
    Ok(())
}

#[test]
fn equal_json_is_not_equal_plan_across_database_or_scope_incarnations() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let root = codec.decode_root(&fixture.encoded_root()?)?;
    let different_database = LocalLogStorageDatabaseIncarnationId::try_new("different-database")?;
    let different_scope = LocalLogStorageScopeIncarnationId::try_new("different-scope")?;
    let prepare = |db, scope| codec.prepare_root_publication(db, scope, &root);
    let first = prepare(&fixture.database_incarnation_id, &fixture.scope_incarnation_id)?;
    let database = prepare(&different_database, &fixture.scope_incarnation_id)?;
    let scope = prepare(&fixture.database_incarnation_id, &different_scope)?;
    assert_eq!(first.candidate_json_bytes(), database.candidate_json_bytes());
    assert_eq!(first.candidate_json_bytes(), scope.candidate_json_bytes());
    assert!(!first.same_plan_as(&database));
    assert!(!first.same_plan_as(&scope));
    assert!(!database.same_plan_as(&scope));
    Ok(())
}

#[test]
fn exact_payload_is_part_of_plan_identity() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let original = fixture.encoded_root()?;
    let changed = original.replace("STORAGEV3PAYLOADSENTINEL", "CHANGEDV3PAYLOADSENTINEL");
    assert_ne!(changed, original);
    assert_eq!(changed.len(), original.len());
    let first = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &codec.decode_root(&original)?,
    )?;
    let second = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &codec.decode_root(&changed)?,
    )?;
    assert_eq!(first.candidate_binding(), second.candidate_binding());
    assert_eq!(first.candidate_json_bytes(), second.candidate_json_bytes());
    assert!(!first.same_plan_as(&second));
    Ok(())
}

#[test]
fn closure_rechecks_input_output_policy_and_rejects_crosswired_bindings() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let json = fixture.encoded_root()?;
    let root = fixture.root_codec().decode_root(&json)?;
    let exact = LocalLogStorageGenerationLimits::default()
        .with_max_input_bytes(json.len())
        .with_max_output_bytes(json.len());
    let codec = fixture.root_codec().with_limits(exact);
    let plan = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    let short_input = fixture.root_codec().with_limits(exact.with_max_input_bytes(json.len() - 1));
    assert!(matches!(
        short_input.prepare_root_publication(
            &fixture.database_incarnation_id,
            &fixture.scope_incarnation_id,
            &root
        ),
        Err(LocalLogStorageAttemptPreparationError::InvalidCandidateEnvelope { .. })
    ));
    let short_output =
        fixture.root_codec().with_limits(exact.with_max_output_bytes(json.len() - 1));
    assert!(matches!(
        short_output.prepare_root_publication(
            &fixture.database_incarnation_id,
            &fixture.scope_incarnation_id,
            &root
        ),
        Err(LocalLogStorageAttemptPreparationError::InvalidCandidate { .. })
    ));
    let other = codec.prepare_root_publication(
        &LocalLogStorageDatabaseIncarnationId::try_new("wrong-database")?,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    let normalized = fixture.normalize_root(&json)?;
    assert!(matches!(
        LocalLogStorageRootPublicationPlanV3::from_normalized(
            normalized,
            other.candidate_binding().clone()
        ),
        Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant { .. })
    ));
    assert!(plan.same_plan_as(&codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root
    )?));
    assert_eq!(codec.encode_root(&root)?, json);
    Ok(())
}
