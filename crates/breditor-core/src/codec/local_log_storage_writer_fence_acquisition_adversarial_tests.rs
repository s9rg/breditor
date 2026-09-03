use std::error::Error;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageMutationFenceBindingObservationError,
    LocalLogStorageMutationFenceBindingObservationErrorCode, LocalLogStorageMutationToken,
    LocalLogStorageSelectedBindingChange, LocalLogStorageSelectedBindingObservationErrorCode,
    LocalLogStorageSelectionKind, LocalLogStorageUncertainWriterFenceAcquisition,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind,
    LocalLogStorageWriterFenceAcquisitionTerminalOutcome,
    LocalLogStorageWriterFenceAcquisitionTransitionError,
    LocalLogStorageWriterFenceAcquisitionTransitionErrorCode,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PAYLOAD_SENTINEL: &str = "ROTATIONATTEMPTPAYLOADSENTINEL";
const CURRENT_WRITER_FENCE: &str = "fence:acquisition-current";
const PROPOSED_WRITER_FENCE: &str = "fence:acquisition-proposed";
const INITIAL_WRITER_EPOCH: u64 = 41;
const TARGET_WRITER_EPOCH: u64 = 42;

#[derive(Clone, Copy)]
struct AllocationSnapshot {
    current_json: *const u8,
    predecessor_json: Option<*const u8>,
    proposed_fence: *const u8,
}

impl AllocationSnapshot {
    fn capture(
        binding: &LocalLogStorageMutationFenceBinding,
        proposed_fence: &LocalLogStorageFenceId,
    ) -> Self {
        Self {
            current_json: binding.current_selection_json().as_ptr(),
            predecessor_json: binding.predecessor_selection_json().map(str::as_ptr),
            proposed_fence: proposed_fence.as_str().as_ptr(),
        }
    }

    fn assert_retained_by(
        self,
        binding: &LocalLogStorageMutationFenceBinding,
        proposed_fence: &LocalLogStorageFenceId,
    ) {
        assert_eq!(binding.current_selection_json().as_ptr(), self.current_json);
        assert_eq!(binding.predecessor_selection_json().map(str::as_ptr), self.predecessor_json);
        assert_eq!(proposed_fence.as_str().as_ptr(), self.proposed_fence);
    }
}

fn epoch(value: u64) -> TestResult<LocalLogStorageWriterEpoch> {
    Ok(LocalLogStorageWriterEpoch::try_new(value)?)
}

fn fence(value: &str) -> TestResult<LocalLogStorageFenceId> {
    Ok(LocalLogStorageFenceId::try_new(value)?)
}

fn acquisition_from_fixture(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageUncertainWriterFenceAcquisition> {
    let binding = LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        epoch(INITIAL_WRITER_EPOCH)?,
        fence(CURRENT_WRITER_FENCE)?,
    );
    Ok(binding
        .try_prepare_writer_fence_acquisition(fence(PROPOSED_WRITER_FENCE)?)?
        .begin_acquisition())
}

fn acquisition(
    kind: LocalLogStorageSelectionKind,
) -> TestResult<LocalLogStorageUncertainWriterFenceAcquisition> {
    let fixture = SelectedRotationFixture::new(kind)?;
    acquisition_from_fixture(&fixture)
}

fn acquire_token(fixture: &SelectedRotationFixture) -> TestResult<LocalLogStorageMutationToken> {
    let mut owner = acquisition_from_fixture(fixture)?;
    let request_id = owner.adapter_request()?.request_id().clone();
    let attestation =
        LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &request_id,
        );
    let outcome = owner.observe_terminal_attestation(attestation)?;
    let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(token) = outcome else {
        return Err("matching acquisition completion did not issue a token".into());
    };
    Ok(token)
}

#[test]
fn request_egress_is_one_shot_payload_bearing_and_diagnostic_redacted() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let mut owner = acquisition(kind)?;
        let attempt_id = owner.attempt_id().clone();
        let expected_current_pointer = owner.expected_binding().current_selection_json().as_ptr();
        let expected_predecessor_pointer =
            owner.expected_binding().predecessor_selection_json().map(str::as_ptr);
        let expected_selected = owner.selected_binding().clone();

        assert!(!owner.request_issued());
        assert!(owner.expected_binding().current_selection_json().contains(PAYLOAD_SENTINEL));
        assert!(!format!("{owner:?}").contains(PAYLOAD_SENTINEL));

        let request_id = {
            let request = owner.adapter_request()?;
            assert_eq!(request.attempt_id(), &attempt_id);
            assert_eq!(request.selected_binding(), &expected_selected);
            assert_eq!(request.expected_writer_epoch(), epoch(INITIAL_WRITER_EPOCH)?);
            assert_eq!(request.expected_writer_fence_id().as_str(), CURRENT_WRITER_FENCE);
            assert_eq!(request.next_writer_epoch(), epoch(TARGET_WRITER_EPOCH)?);
            assert_eq!(request.proposed_writer_fence_id().as_str(), PROPOSED_WRITER_FENCE);
            assert!(request.current_selection_json().contains(PAYLOAD_SENTINEL));
            assert_eq!(request.current_selection_json().as_ptr(), expected_current_pointer);
            assert_eq!(
                request.predecessor_selection_json().map(str::as_ptr),
                expected_predecessor_pointer
            );
            assert_eq!(
                request.current_selection_json_bytes(),
                request.current_selection_json().len()
            );
            assert_eq!(
                request.predecessor_selection_json_bytes(),
                request.predecessor_selection_json().map(str::len)
            );
            assert_eq!(
                request.predecessor_selection_json().is_some(),
                kind == LocalLogStorageSelectionKind::Rotation
            );

            let request_debug = format!("{request:?}");
            assert!(request_debug.contains("current_selection_json_bytes"));
            assert!(!request_debug.contains(PAYLOAD_SENTINEL));
            assert!(!request_debug.contains(request.current_selection_json()));
            assert!(!format!("{:?}", request.request_id()).contains("0x"));
            request.request_id().clone()
        };

        assert!(owner.request_issued());
        assert_eq!(request_id.attempt_id(), &attempt_id);
        let error = owner
            .adapter_request()
            .err()
            .ok_or("one acquisition attempt yielded a second request")?;
        assert_eq!(
            error,
            LocalLogStorageWriterFenceAcquisitionTransitionError::RequestAlreadyIssued
        );
        assert_eq!(
            error.code(),
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestAlreadyIssued
        );
    }
    Ok(())
}

#[test]
fn matching_complete_issues_the_exact_target_token_for_root_and_rotation() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let mut owner = acquisition(kind)?;
        let attempt_id = owner.attempt_id().clone();
        let expected_selected = owner.selected_binding().clone();
        let expected_current_bytes = owner.current_selection_json_bytes();
        let expected_predecessor_bytes = owner.predecessor_selection_json_bytes();
        let allocations =
            AllocationSnapshot::capture(owner.expected_binding(), owner.proposed_writer_fence_id());
        let request_id = owner.adapter_request()?.request_id().clone();
        let attestation =
            LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
                &request_id,
            );

        assert_eq!(
            attestation.kind(),
            LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::AcquisitionCompleted
        );
        assert_eq!(attestation.attempt_id(), &attempt_id);
        assert_eq!(attestation.request_id(), Some(&request_id));

        let outcome = owner.observe_terminal_attestation(attestation)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(token) = outcome else {
            return Err("matching completion returned a negative acquisition outcome".into());
        };

        assert_eq!(token.attempt_id(), &attempt_id);
        assert_eq!(token.request_id(), &request_id);
        assert_eq!(token.selected_binding(), &expected_selected);
        assert_eq!(token.writer_epoch(), epoch(TARGET_WRITER_EPOCH)?);
        assert_eq!(token.current_writer_fence_id().as_str(), PROPOSED_WRITER_FENCE);
        assert_eq!(token.current_selection_json_bytes(), expected_current_bytes);
        assert_eq!(token.predecessor_selection_json_bytes(), expected_predecessor_bytes);
        allocations.assert_retained_by(token.binding(), token.current_writer_fence_id());
        assert!(token.binding().current_selection_json().contains(PAYLOAD_SENTINEL));
        let token_debug = format!("{token:?}");
        assert!(token_debug.contains("LocalLogStorageMutationToken"));
        assert!(!token_debug.contains(PAYLOAD_SENTINEL));
        assert!(!token_debug.contains(token.binding().current_selection_json()));
    }
    Ok(())
}

#[test]
fn final_epoch_acquisition_issues_a_max_token_but_has_no_successor() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let binding = LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        epoch(u64::MAX - 1)?,
        fence(CURRENT_WRITER_FENCE)?,
    );
    let mut owner = binding
        .try_prepare_writer_fence_acquisition(fence(PROPOSED_WRITER_FENCE)?)?
        .begin_acquisition();
    let request_id = owner.adapter_request()?.request_id().clone();
    let completed = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
        &request_id,
    );
    let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(token) =
        owner.observe_terminal_attestation(completed)?
    else {
        return Err("final-epoch completion did not issue a token".into());
    };

    assert_eq!(token.writer_epoch(), epoch(u64::MAX)?);
    assert_eq!(token.request_id(), &request_id);
    assert!(token.writer_epoch().successor().is_err());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn abort_and_not_attempted_enforce_egress_rules_and_preserve_negative_owners() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let owner = acquisition(kind)?;
        let attempt_id = owner.attempt_id().clone();
        let synthetic_request_id = LocalLogStorageWriterFenceAcquisitionRequestId::new(&attempt_id);
        let premature_abort =
            LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
                &synthetic_request_id,
            );
        let failure = owner
            .observe_terminal_attestation(premature_abort)
            .err()
            .ok_or("abort before request egress unexpectedly became terminal")?;
        assert_eq!(
            failure.code(),
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestNotIssued
        );
        assert!(!failure.owner().request_issued());
        let owner = failure.into_owner();

        let not_attempted = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::not_attempted(
            owner.attempt_id(),
        );
        let outcome = owner.observe_terminal_attestation(not_attempted)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(state) = outcome
        else {
            return Err("pre-egress not-attempted returned the wrong outcome".into());
        };
        assert_eq!(state.attempt_id(), &attempt_id);
        assert!(!state.request_issued());
        assert_eq!(state.next_writer_epoch(), epoch(TARGET_WRITER_EPOCH)?);
        assert_eq!(state.proposed_writer_fence_id().as_str(), PROPOSED_WRITER_FENCE);
        assert!(!format!("{state:?}").contains(PAYLOAD_SENTINEL));

        let mut owner = acquisition(kind)?;
        let attempt_id = owner.attempt_id().clone();
        let request_id = owner.adapter_request()?.request_id().clone();
        let abort = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
            &request_id,
        );
        let outcome = owner.observe_terminal_attestation(abort)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::TransactionAborted(state) =
            outcome
        else {
            return Err("matching abort returned the wrong outcome".into());
        };
        assert_eq!(state.attempt_id(), &attempt_id);
        assert_eq!(state.request_id(), &request_id);
        assert_eq!(state.next_writer_epoch(), epoch(TARGET_WRITER_EPOCH)?);
        assert_eq!(state.proposed_writer_fence_id().as_str(), PROPOSED_WRITER_FENCE);
        assert!(!format!("{state:?}").contains(PAYLOAD_SENTINEL));

        let mut owner = acquisition(kind)?;
        let attempt_id = owner.attempt_id().clone();
        let request_id = owner.adapter_request()?.request_id().clone();
        let not_attempted =
            LocalLogStorageWriterFenceAcquisitionTerminalAttestation::not_attempted(&attempt_id);
        let outcome = owner.observe_terminal_attestation(not_attempted)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(state) = outcome
        else {
            return Err("post-egress not-attempted returned the wrong outcome".into());
        };
        assert_eq!(state.attempt_id(), &attempt_id);
        assert!(state.request_issued());
        assert_eq!(request_id.attempt_id(), state.attempt_id());
        assert_eq!(state.next_writer_epoch(), epoch(TARGET_WRITER_EPOCH)?);
        assert_eq!(state.proposed_writer_fence_id().as_str(), PROPOSED_WRITER_FENCE);
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn mismatch_precedence_is_stable_and_failure_preserves_owner_and_attestation() -> TestResult {
    let owner = acquisition(LocalLogStorageSelectionKind::Rotation)?;
    let retained_attempt_id = owner.attempt_id().clone();
    let retained_current_pointer = owner.expected_binding().current_selection_json().as_ptr();

    let foreign_attempt_id = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
    let foreign_request_id =
        LocalLogStorageWriterFenceAcquisitionRequestId::new(&foreign_attempt_id);
    let foreign_complete =
        LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &foreign_request_id,
        );
    let failure = owner
        .observe_terminal_attestation(foreign_complete)
        .err()
        .ok_or("foreign pre-egress completion unexpectedly matched")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
    );
    assert_eq!(failure.owner().attempt_id(), &retained_attempt_id);
    assert!(!failure.owner().request_issued());
    assert_eq!(
        failure.owner().expected_binding().current_selection_json().as_ptr(),
        retained_current_pointer
    );
    assert_eq!(failure.attestation().attempt_id(), &foreign_attempt_id);
    assert_eq!(failure.attestation().request_id(), Some(&foreign_request_id));
    assert!(!format!("{failure:?} {failure}").contains(PAYLOAD_SENTINEL));
    let owner = failure.into_owner();

    let same_attempt_unissued_request =
        LocalLogStorageWriterFenceAcquisitionRequestId::new(owner.attempt_id());
    let premature_complete =
        LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &same_attempt_unissued_request,
        );
    let failure = owner
        .observe_terminal_attestation(premature_complete)
        .err()
        .ok_or("same-attempt completion before egress unexpectedly matched")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestNotIssued
    );
    assert_eq!(failure.owner().attempt_id(), &retained_attempt_id);
    assert!(!failure.owner().request_issued());
    let mut owner = failure.into_owner();

    let emitted_request_id = owner.adapter_request()?.request_id().clone();
    let sibling_request_id =
        LocalLogStorageWriterFenceAcquisitionRequestId::new(owner.attempt_id());
    let sibling_abort =
        LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
            &sibling_request_id,
        );
    let failure = owner
        .observe_terminal_attestation(sibling_abort)
        .err()
        .ok_or("same-attempt foreign request unexpectedly matched")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestIdMismatch
    );
    assert!(failure.owner().request_issued());
    assert_eq!(failure.attestation().request_id(), Some(&sibling_request_id));
    let owner = failure.into_owner();

    let foreign_complete =
        LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &foreign_request_id,
        );
    let failure = owner
        .observe_terminal_attestation(foreign_complete)
        .err()
        .ok_or("foreign post-egress completion unexpectedly matched")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
    );
    let owner = failure.into_owner();

    let abort = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
        &emitted_request_id,
    );
    assert!(matches!(
        owner.observe_terminal_attestation(abort)?,
        LocalLogStorageWriterFenceAcquisitionTerminalOutcome::TransactionAborted(_)
    ));
    Ok(())
}

#[test]
fn terminal_failure_into_parts_returns_all_unapplied_values() -> TestResult {
    let owner = acquisition(LocalLogStorageSelectionKind::Root)?;
    let attempt_id = owner.attempt_id().clone();
    let current_pointer = owner.expected_binding().current_selection_json().as_ptr();
    let synthetic_request_id =
        LocalLogStorageWriterFenceAcquisitionRequestId::new(owner.attempt_id());
    let completed = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
        &synthetic_request_id,
    );
    let failure = owner
        .observe_terminal_attestation(completed)
        .err()
        .ok_or("pre-egress completion unexpectedly matched")?;

    let (owner, attestation, error) = failure.into_parts();
    assert_eq!(owner.attempt_id(), &attempt_id);
    assert!(!owner.request_issued());
    assert_eq!(owner.expected_binding().current_selection_json().as_ptr(), current_pointer);
    assert_eq!(attestation.request_id(), Some(&synthetic_request_id));
    assert_eq!(error, LocalLogStorageWriterFenceAcquisitionTransitionError::RequestNotIssued);
    Ok(())
}

#[test]
fn uncertain_exact_resubmission_preserves_allocations_and_rejects_stale_callbacks() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let mut owner = acquisition(kind)?;
        let old_attempt_id = owner.attempt_id().clone();
        let allocations =
            AllocationSnapshot::capture(owner.expected_binding(), owner.proposed_writer_fence_id());
        let old_request_id = owner.adapter_request()?.request_id().clone();

        let mut owner = owner.begin_exact_resubmission();
        assert_ne!(owner.attempt_id(), &old_attempt_id);
        assert!(!owner.request_issued());
        allocations.assert_retained_by(owner.expected_binding(), owner.proposed_writer_fence_id());
        let new_request_id = owner.adapter_request()?.request_id().clone();
        assert_ne!(new_request_id, old_request_id);
        assert_eq!(new_request_id.attempt_id(), owner.attempt_id());
        allocations.assert_retained_by(owner.expected_binding(), owner.proposed_writer_fence_id());

        let stale = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &old_request_id,
        );
        let failure = owner
            .observe_terminal_attestation(stale)
            .err()
            .ok_or("old acquisition callback matched a resubmission")?;
        assert_eq!(
            failure.code(),
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
        );
        let owner = failure.into_owner();
        let complete =
            LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
                &new_request_id,
            );
        assert!(matches!(
            owner.observe_terminal_attestation(complete)?,
            LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(_)
        ));
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn negative_exact_resubmissions_preserve_allocations_and_refresh_ids() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let mut owner = acquisition(kind)?;
        let old_attempt_id = owner.attempt_id().clone();
        let allocations =
            AllocationSnapshot::capture(owner.expected_binding(), owner.proposed_writer_fence_id());
        let old_request_id = owner.adapter_request()?.request_id().clone();
        let abort = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
            &old_request_id,
        );
        let outcome = owner.observe_terminal_attestation(abort)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::TransactionAborted(aborted) =
            outcome
        else {
            return Err("matching abort did not retain an aborted owner".into());
        };
        allocations
            .assert_retained_by(aborted.expected_binding(), aborted.proposed_writer_fence_id());

        let mut owner = aborted.begin_exact_resubmission();
        assert_ne!(owner.attempt_id(), &old_attempt_id);
        assert!(!owner.request_issued());
        allocations.assert_retained_by(owner.expected_binding(), owner.proposed_writer_fence_id());
        let new_request_id = owner.adapter_request()?.request_id().clone();
        assert_ne!(new_request_id, old_request_id);
        let stale = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
            &old_request_id,
        );
        let failure = owner
            .observe_terminal_attestation(stale)
            .err()
            .ok_or("aborted attempt callback matched its resubmission")?;
        assert_eq!(
            failure.code(),
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
        );

        let owner = acquisition(kind)?;
        let old_attempt_id = owner.attempt_id().clone();
        let allocations =
            AllocationSnapshot::capture(owner.expected_binding(), owner.proposed_writer_fence_id());
        let not_attempted = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::not_attempted(
            owner.attempt_id(),
        );
        let outcome = owner.observe_terminal_attestation(not_attempted)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(not_attempted) =
            outcome
        else {
            return Err("not-attempted did not retain its exact owner".into());
        };
        allocations.assert_retained_by(
            not_attempted.expected_binding(),
            not_attempted.proposed_writer_fence_id(),
        );
        let owner = not_attempted.begin_exact_resubmission();
        assert_ne!(owner.attempt_id(), &old_attempt_id);
        assert!(!owner.request_issued());
        allocations.assert_retained_by(owner.expected_binding(), owner.proposed_writer_fence_id());

        let mut owner = acquisition(kind)?;
        let old_attempt_id = owner.attempt_id().clone();
        let allocations =
            AllocationSnapshot::capture(owner.expected_binding(), owner.proposed_writer_fence_id());
        let old_request_id = owner.adapter_request()?.request_id().clone();
        let not_attempted_attestation =
            LocalLogStorageWriterFenceAcquisitionTerminalAttestation::not_attempted(
                &old_attempt_id,
            );
        let outcome = owner.observe_terminal_attestation(not_attempted_attestation)?;
        let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(not_attempted) =
            outcome
        else {
            return Err("post-egress not-attempted did not retain its exact owner".into());
        };
        assert!(not_attempted.request_issued());
        let mut owner = not_attempted.begin_exact_resubmission();
        assert_ne!(owner.attempt_id(), &old_attempt_id);
        allocations.assert_retained_by(owner.expected_binding(), owner.proposed_writer_fence_id());
        let new_request_id = owner.adapter_request()?.request_id().clone();
        assert_ne!(new_request_id, old_request_id);
        let stale = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::transaction_aborted(
            &old_request_id,
        );
        let failure = owner
            .observe_terminal_attestation(stale)
            .err()
            .ok_or("not-attempted callback matched its resubmission")?;
        assert_eq!(
            failure.code(),
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch
        );
    }
    Ok(())
}

#[test]
fn acquired_tokens_compare_directionally_and_fail_closed_after_writer_revocation() -> TestResult {
    let retired_fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let reclaimed_fixture = SelectedRotationFixture::reclaimed_rotation()?;
    let token = acquire_token(&retired_fixture)?;

    let unchanged = token.binding().clone();
    assert_eq!(
        token.binding().compare_later_observation(&unchanged),
        Ok(LocalLogStorageSelectedBindingChange::Unchanged)
    );

    let reclaimed = LocalLogStorageMutationFenceBinding::from_selected(
        &reclaimed_fixture.selected,
        token.writer_epoch(),
        token.current_writer_fence_id().clone(),
    );
    assert_eq!(
        token.binding().compare_later_observation(&reclaimed),
        Ok(LocalLogStorageSelectedBindingChange::CheckpointReclaimed)
    );

    let later_epoch = token.binding().clone().with_writer_fence(
        token.writer_epoch().successor()?,
        token.current_writer_fence_id().clone(),
    );
    let error = token
        .binding()
        .compare_later_observation(&later_epoch)
        .err()
        .ok_or("a later writer epoch did not revoke the acquired token")?;
    assert_eq!(error, LocalLogStorageMutationFenceBindingObservationError::WriterEpochMismatch);
    assert_eq!(
        error.code(),
        LocalLogStorageMutationFenceBindingObservationErrorCode::WriterEpochMismatch
    );

    let later_fence = token
        .binding()
        .clone()
        .with_writer_fence(token.writer_epoch(), fence("fence:later-owner")?);
    let error = token
        .binding()
        .compare_later_observation(&later_fence)
        .err()
        .ok_or("a later writer fence did not revoke the acquired token")?;
    assert_eq!(
        error,
        LocalLogStorageMutationFenceBindingObservationError::CurrentWriterFenceMismatch
    );
    assert_eq!(
        error.code(),
        LocalLogStorageMutationFenceBindingObservationErrorCode::CurrentWriterFenceMismatch
    );

    let reclaimed_token = acquire_token(&reclaimed_fixture)?;
    let retired = LocalLogStorageMutationFenceBinding::from_selected(
        &retired_fixture.selected,
        reclaimed_token.writer_epoch(),
        reclaimed_token.current_writer_fence_id().clone(),
    );
    let regression = reclaimed_token
        .binding()
        .compare_later_observation(&retired)
        .err()
        .ok_or("reclaimed checkpoint regressed to retired")?;
    assert_eq!(
        regression,
        LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
            code: LocalLogStorageSelectedBindingObservationErrorCode::CheckpointStateRegression,
        }
    );
    assert_eq!(
        regression.code(),
        LocalLogStorageMutationFenceBindingObservationErrorCode::SelectedBindingMismatch
    );
    Ok(())
}

#[test]
fn acquisition_kinds_and_transition_codes_have_stable_spellings() {
    for (kind, spelling) in [
        (
            LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::AcquisitionCompleted,
            "acquisition_completed",
        ),
        (
            LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::TransactionAborted,
            "transaction_aborted",
        ),
        (
            LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::NotAttempted,
            "not_attempted",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (error, code, spelling) in [
        (
            LocalLogStorageWriterFenceAcquisitionTransitionError::AttemptIdMismatch,
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::AttemptIdMismatch,
            "local_log_storage_writer_fence_acquisition_transition.attempt_id_mismatch",
        ),
        (
            LocalLogStorageWriterFenceAcquisitionTransitionError::RequestAlreadyIssued,
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestAlreadyIssued,
            "local_log_storage_writer_fence_acquisition_transition.request_already_issued",
        ),
        (
            LocalLogStorageWriterFenceAcquisitionTransitionError::RequestNotIssued,
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestNotIssued,
            "local_log_storage_writer_fence_acquisition_transition.request_not_issued",
        ),
        (
            LocalLogStorageWriterFenceAcquisitionTransitionError::RequestIdMismatch,
            LocalLogStorageWriterFenceAcquisitionTransitionErrorCode::RequestIdMismatch,
            "local_log_storage_writer_fence_acquisition_transition.request_id_mismatch",
        ),
    ] {
        assert_eq!(error.code(), code);
        assert_eq!(code.as_str(), spelling);
    }
}
