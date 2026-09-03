use std::{error::Error, sync::Arc};

use crate::local_log::{LocalLogId, LocalLogStorageFenceId, LocalLogStorageWriterEpoch};

use super::{
    LocalLogFrameLimits, LocalLogStorageMutationFenceBinding,
    LocalLogStorageMutationFenceBindingObservationError,
    LocalLogStorageMutationFenceBindingObservationErrorCode,
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedBindingChange, LocalLogStorageSelectedBindingObservationErrorCode,
    LocalLogStorageSelectionKind, LocalLogStorageWriterFenceAcquisitionPreparationError,
    LocalLogStorageWriterFenceAcquisitionPreparationErrorCode,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PAYLOAD_SENTINEL: &str = "ROTATIONATTEMPTPAYLOADSENTINEL";
const ALTERED_PAYLOAD_SENTINEL: &str = "XOTATIONATTEMPTPAYLOADSENTINEL";

fn fence(value: &str) -> TestResult<LocalLogStorageFenceId> {
    Ok(LocalLogStorageFenceId::try_new(value)?)
}

fn epoch(value: u64) -> TestResult<LocalLogStorageWriterEpoch> {
    Ok(LocalLogStorageWriterEpoch::try_new(value)?)
}

fn snapshot(
    fixture: &SelectedRotationFixture,
    writer_epoch: LocalLogStorageWriterEpoch,
    current_writer_fence_id: LocalLogStorageFenceId,
) -> LocalLogStorageMutationFenceBinding {
    LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        writer_epoch,
        current_writer_fence_id,
    )
}

fn from_parts_like(
    selected_binding: LocalLogStorageSelectedBinding,
    current_selection_json: &str,
    predecessor_selection_json: Option<&str>,
    writer_epoch: LocalLogStorageWriterEpoch,
    current_writer_fence_id: LocalLogStorageFenceId,
) -> LocalLogStorageMutationFenceBinding {
    LocalLogStorageMutationFenceBinding::from_parts(
        selected_binding,
        Arc::from(current_selection_json),
        predecessor_selection_json.map(Arc::from),
        writer_epoch,
        current_writer_fence_id,
    )
}

fn exact_from_parts_like(
    source: &LocalLogStorageMutationFenceBinding,
    selected_binding: LocalLogStorageSelectedBinding,
    writer_epoch: LocalLogStorageWriterEpoch,
    current_writer_fence_id: LocalLogStorageFenceId,
) -> LocalLogStorageMutationFenceBinding {
    from_parts_like(
        selected_binding,
        source.current_selection_json(),
        source.predecessor_selection_json(),
        writer_epoch,
        current_writer_fence_id,
    )
}

fn selected_with_active(
    source: &LocalLogStorageMutationFenceBinding,
    active_generation: LocalLogStorageSelectedActiveGenerationBinding,
) -> TestResult<LocalLogStorageSelectedBinding> {
    Ok(LocalLogStorageSelectedBinding::try_new(
        source.current_receipt().clone(),
        source.selected_binding().predecessor_receipt().cloned(),
        source.selected_binding().checkpoint_generation().clone(),
        active_generation,
    )?)
}

#[test]
fn root_and_rotation_snapshots_retain_exact_selected_and_mutable_facts() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let writer_epoch = epoch(7)?;
        let current_fence = fence("fence:mutable-current")?;
        let binding = snapshot(&fixture, writer_epoch, current_fence.clone());

        assert_eq!(binding.selected_binding(), fixture.selected.binding());
        assert_eq!(binding.current_receipt(), fixture.selected.current_receipt());
        assert_eq!(binding.active_generation(), fixture.selected.binding().active_generation());
        assert_eq!(binding.writer_epoch(), writer_epoch);
        assert_eq!(binding.current_writer_fence_id(), &current_fence);
        assert_eq!(binding.current_selection_json(), fixture.selected.current_selection_json());
        assert_eq!(
            binding.current_selection_json_bytes(),
            fixture.selected.current_selection_json_bytes()
        );
        assert_eq!(
            binding.predecessor_selection_json(),
            fixture.selected.predecessor_selection_json()
        );
        assert_eq!(
            binding.predecessor_selection_json_bytes(),
            fixture.selected.predecessor_selection_json_bytes()
        );
        assert_eq!(binding.current_receipt().selection_kind(), kind);
        assert_eq!(binding.active_generation().log_id(), fixture.selected.active_log_id());
        assert_eq!(binding.active_generation().session_id(), fixture.selected.session_id());
        assert_eq!(binding.active_generation().frame(), fixture.selected.active_frame());
        assert_eq!(
            binding.active_generation().activated_fence_id(),
            fixture.selected.activation_fence_id()
        );
        assert_eq!(
            binding.active_generation().activated_by_head_id(),
            fixture.selected.selected_head_id()
        );

        match kind {
            LocalLogStorageSelectionKind::Root => {
                assert_eq!(binding.selected_binding().predecessor_receipt(), None);
                assert_eq!(binding.predecessor_selection_json_bytes(), None);
            }
            LocalLogStorageSelectionKind::Rotation => {
                assert_eq!(
                    binding.selected_binding().predecessor_receipt(),
                    fixture.selected.predecessor_receipt()
                );
                assert!(binding.predecessor_selection_json_bytes().is_some());
            }
        }
    }
    Ok(())
}

#[test]
fn unchanged_observations_compare_exactly_for_root_and_rotation() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let expected = snapshot(&fixture, epoch(9)?, fence("fence:current")?);
        let observed = expected.clone();

        assert_eq!(
            expected.compare_later_observation(&observed),
            Ok(LocalLogStorageSelectedBindingChange::Unchanged)
        );
        assert_eq!(expected, observed);
    }
    Ok(())
}

#[test]
fn checkpoint_cleanup_is_directional_while_structural_equality_stays_exact() -> TestResult {
    let retired_fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let reclaimed_fixture = SelectedRotationFixture::reclaimed_rotation()?;
    let current_fence = fence("fence:current")?;
    let retired = snapshot(&retired_fixture, epoch(11)?, current_fence.clone());
    let reclaimed = snapshot(&reclaimed_fixture, epoch(11)?, current_fence);

    assert_eq!(retired.current_selection_json(), reclaimed.current_selection_json());
    assert_eq!(retired.predecessor_selection_json(), reclaimed.predecessor_selection_json());
    assert_ne!(retired, reclaimed);
    assert_eq!(
        retired.compare_later_observation(&reclaimed),
        Ok(LocalLogStorageSelectedBindingChange::CheckpointReclaimed)
    );

    let regression = reclaimed.compare_later_observation(&retired);
    assert_eq!(
        regression,
        Err(LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
            code: LocalLogStorageSelectedBindingObservationErrorCode::CheckpointStateRegression,
        })
    );
    let error = regression.err().ok_or("cleanup regression unexpectedly compared")?;
    assert_eq!(
        error.code(),
        LocalLogStorageMutationFenceBindingObservationErrorCode::SelectedBindingMismatch
    );
    assert_eq!(
        error.selected_binding_code(),
        Some(LocalLogStorageSelectedBindingObservationErrorCode::CheckpointStateRegression)
    );

    let reclaimed_with_changed_epoch =
        snapshot(&reclaimed_fixture, epoch(12)?, fence("fence:current")?);
    assert_eq!(
        retired.compare_later_observation(&reclaimed_with_changed_epoch),
        Err(LocalLogStorageMutationFenceBindingObservationError::WriterEpochMismatch)
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn comparison_projects_nested_active_mismatches_and_enforces_outer_precedence() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let expected = snapshot(&fixture, epoch(17)?, fence("fence:current")?);
    let active = expected.active_generation();
    let changed_active = [
        LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:changed-active")?,
            active.session_id().clone(),
            active.frame(),
            active.activated_fence_id().clone(),
            active.activated_by_head_id().clone(),
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            active.log_id().clone(),
            active.session_id().clone(),
            super::LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(16_384)),
            active.activated_fence_id().clone(),
            active.activated_by_head_id().clone(),
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            active.log_id().clone(),
            active.session_id().clone(),
            active.frame(),
            fence("fence:changed-activation")?,
            active.activated_by_head_id().clone(),
        ),
    ];

    for changed in changed_active {
        let changed_selected = selected_with_active(&expected, changed)?;
        let observed = exact_from_parts_like(
            &expected,
            changed_selected,
            expected.writer_epoch(),
            expected.current_writer_fence_id().clone(),
        );
        let error = expected
            .compare_later_observation(&observed)
            .err()
            .ok_or("changed active generation unexpectedly compared")?;
        assert_eq!(
            error,
            LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
                code: LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch,
            }
        );
        assert_eq!(
            error.selected_binding_code(),
            Some(LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch)
        );
    }

    let changed_selected = selected_with_active(
        &expected,
        LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:changed-active-for-precedence")?,
            active.session_id().clone(),
            active.frame(),
            active.activated_fence_id().clone(),
            active.activated_by_head_id().clone(),
        ),
    )?;
    let current_byte_mismatch =
        expected.current_selection_json().replacen(PAYLOAD_SENTINEL, ALTERED_PAYLOAD_SENTINEL, 1);
    let predecessor_byte_mismatch = expected
        .predecessor_selection_json()
        .ok_or("rotation binding omitted predecessor bytes")?
        .replacen(PAYLOAD_SENTINEL, ALTERED_PAYLOAD_SENTINEL, 1);
    assert_ne!(current_byte_mismatch, expected.current_selection_json());
    assert_eq!(current_byte_mismatch.len(), expected.current_selection_json_bytes());
    assert_ne!(Some(predecessor_byte_mismatch.as_str()), expected.predecessor_selection_json());
    assert_eq!(Some(predecessor_byte_mismatch.len()), expected.predecessor_selection_json_bytes());
    let all_changed = from_parts_like(
        changed_selected,
        &current_byte_mismatch,
        Some(predecessor_byte_mismatch.as_str()),
        epoch(18)?,
        fence("fence:changed-current")?,
    );
    assert_eq!(
        expected.compare_later_observation(&all_changed),
        Err(LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
            code: LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch,
        })
    );

    let current_and_later_changed = from_parts_like(
        expected.selected_binding().clone(),
        &current_byte_mismatch,
        Some(predecessor_byte_mismatch.as_str()),
        epoch(18)?,
        fence("fence:changed-current")?,
    );
    assert_eq!(
        expected.compare_later_observation(&current_and_later_changed),
        Err(LocalLogStorageMutationFenceBindingObservationError::CurrentSelectionMismatch)
    );

    let predecessor_and_later_changed = from_parts_like(
        expected.selected_binding().clone(),
        expected.current_selection_json(),
        Some(predecessor_byte_mismatch.as_str()),
        epoch(18)?,
        fence("fence:changed-current")?,
    );
    assert_eq!(
        expected.compare_later_observation(&predecessor_and_later_changed),
        Err(LocalLogStorageMutationFenceBindingObservationError::PredecessorSelectionMismatch)
    );

    let epoch_and_fence_changed = exact_from_parts_like(
        &expected,
        expected.selected_binding().clone(),
        epoch(18)?,
        fence("fence:changed-current")?,
    );
    assert_eq!(
        expected.compare_later_observation(&epoch_and_fence_changed),
        Err(LocalLogStorageMutationFenceBindingObservationError::WriterEpochMismatch)
    );

    let fence_changed = exact_from_parts_like(
        &expected,
        expected.selected_binding().clone(),
        expected.writer_epoch(),
        fence("fence:changed-current")?,
    );
    assert_eq!(
        expected.compare_later_observation(&fence_changed),
        Err(LocalLogStorageMutationFenceBindingObservationError::CurrentWriterFenceMismatch)
    );
    Ok(())
}

#[test]
fn current_writer_fence_may_initially_equal_the_immutable_activation_fence() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let initial_epoch = match kind {
            LocalLogStorageSelectionKind::Root => LocalLogStorageWriterEpoch::FIRST,
            LocalLogStorageSelectionKind::Rotation => epoch(2)?,
        };
        let binding =
            snapshot(&fixture, initial_epoch, fixture.selected.activation_fence_id().clone());

        assert_eq!(
            binding.current_writer_fence_id(),
            binding.active_generation().activated_fence_id()
        );
        assert_eq!(
            binding.compare_later_observation(&binding),
            Ok(LocalLogStorageSelectedBindingChange::Unchanged)
        );
    }
    Ok(())
}

#[test]
fn acquisition_advances_exactly_once_including_the_final_representable_epoch() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        for (current, next) in [(1_u64, 2_u64), (41, 42), (u64::MAX - 1, u64::MAX)] {
            let binding = snapshot(&fixture, epoch(current)?, fence("fence:current")?);
            let expected = binding.clone();
            let proposal = fence("fence:proposal")?;
            let plan = binding.try_prepare_writer_fence_acquisition(proposal.clone())?;

            assert_eq!(plan.expected_binding(), &expected);
            assert_eq!(plan.expected_binding().current_receipt().selection_kind(), kind);
            assert_eq!(plan.next_writer_epoch(), epoch(next)?);
            assert_eq!(plan.proposed_writer_fence_id(), &proposal);
        }
    }
    Ok(())
}

#[test]
fn exhausted_acquisition_retains_both_inputs_without_changing_allocations() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let binding = snapshot(&fixture, LocalLogStorageWriterEpoch::MAX, fence("fence:current")?);
    let expected = binding.clone();
    let current_json_pointer = binding.current_selection_json().as_ptr();
    let predecessor_json_pointer = binding
        .predecessor_selection_json()
        .ok_or("rotation binding omitted predecessor bytes")?
        .as_ptr();
    let proposal = fence("fence:proposal")?;
    let proposal_pointer = proposal.as_str().as_ptr();

    let failure = binding
        .try_prepare_writer_fence_acquisition(proposal)
        .err()
        .ok_or("maximum writer epoch unexpectedly prepared")?;
    assert_eq!(
        failure.error(),
        &LocalLogStorageWriterFenceAcquisitionPreparationError::EpochExhausted
    );
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::EpochExhausted
    );
    assert_eq!(failure.expected_binding(), &expected);
    assert_eq!(failure.expected_binding().current_selection_json().as_ptr(), current_json_pointer);
    assert_eq!(
        failure
            .expected_binding()
            .predecessor_selection_json()
            .ok_or("retained rotation binding omitted predecessor bytes")?
            .as_ptr(),
        predecessor_json_pointer
    );
    assert_eq!(failure.proposed_writer_fence_id().as_str().as_ptr(), proposal_pointer);

    let (returned_binding, returned_proposal, error) = failure.into_parts();
    assert_eq!(returned_binding, expected);
    assert_eq!(returned_binding.current_selection_json().as_ptr(), current_json_pointer);
    assert_eq!(returned_proposal.as_str().as_ptr(), proposal_pointer);
    assert_eq!(error, LocalLogStorageWriterFenceAcquisitionPreparationError::EpochExhausted);

    let both_invalid = snapshot(&fixture, LocalLogStorageWriterEpoch::MAX, fence("fence:current")?);
    let reused = both_invalid.current_writer_fence_id().clone();
    let failure = both_invalid
        .try_prepare_writer_fence_acquisition(reused)
        .err()
        .ok_or("exhausted same-fence proposal unexpectedly prepared")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::EpochExhausted
    );
    Ok(())
}

#[test]
fn acquisition_rejects_only_equality_with_the_current_fence_locally() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let binding = snapshot(&fixture, epoch(31)?, fence("fence:current")?);
    let expected = binding.clone();
    let reused = binding.current_writer_fence_id().clone();
    let reused_pointer = reused.as_str().as_ptr();
    let failure = binding
        .try_prepare_writer_fence_acquisition(reused)
        .err()
        .ok_or("same-current writer fence unexpectedly prepared")?;

    assert_eq!(
        failure.error(),
        &LocalLogStorageWriterFenceAcquisitionPreparationError::CurrentWriterFenceReused
    );
    assert_eq!(
        failure.code(),
        LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::CurrentWriterFenceReused
    );
    assert_eq!(failure.expected_binding(), &expected);
    assert_eq!(failure.proposed_writer_fence_id().as_str().as_ptr(), reused_pointer);

    // A historically used activation fence is intentionally accepted here
    // when it differs from the mutable current fence. This pure plan does not
    // claim lifetime- or scope-global fence freshness.
    let historical_fence = fixture.selected.activation_fence_id().clone();
    let different = snapshot(&fixture, epoch(31)?, fence("fence:current")?);
    let plan = different.try_prepare_writer_fence_acquisition(historical_fence.clone())?;
    assert_eq!(plan.next_writer_epoch(), epoch(32)?);
    assert_eq!(plan.proposed_writer_fence_id(), &historical_fence);
    Ok(())
}

#[test]
fn diagnostics_redact_exact_payloads_and_publish_stable_error_codes() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let ordinary = snapshot(&fixture, epoch(41)?, fence("fence:current")?);
    assert!(ordinary.current_selection_json().contains(PAYLOAD_SENTINEL));
    assert!(
        ordinary
            .predecessor_selection_json()
            .ok_or("rotation binding omitted predecessor bytes")?
            .contains(PAYLOAD_SENTINEL)
    );
    let binding_debug = format!("{ordinary:?}");
    assert!(binding_debug.contains("current_selection_json_bytes"));
    assert!(!binding_debug.contains(PAYLOAD_SENTINEL));
    assert!(!binding_debug.contains(ordinary.current_selection_json()));

    let plan = ordinary.clone().try_prepare_writer_fence_acquisition(fence("fence:proposal")?)?;
    let plan_debug = format!("{plan:?}");
    assert!(!plan_debug.contains(PAYLOAD_SENTINEL));
    assert!(!plan_debug.contains(ordinary.current_selection_json()));

    let exhausted = exact_from_parts_like(
        &ordinary,
        ordinary.selected_binding().clone(),
        LocalLogStorageWriterEpoch::MAX,
        ordinary.current_writer_fence_id().clone(),
    );
    let failure = exhausted
        .try_prepare_writer_fence_acquisition(fence("fence:proposal")?)
        .err()
        .ok_or("exhausted writer epoch unexpectedly prepared")?;
    assert!(!format!("{failure:?} {failure}").contains(PAYLOAD_SENTINEL));

    let observation_codes = [
        (
            LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
                code: LocalLogStorageSelectedBindingObservationErrorCode::ActiveGenerationMismatch,
            },
            LocalLogStorageMutationFenceBindingObservationErrorCode::SelectedBindingMismatch,
            "local_log_storage_mutation_fence_binding_observation.selected_binding_mismatch",
        ),
        (
            LocalLogStorageMutationFenceBindingObservationError::CurrentSelectionMismatch,
            LocalLogStorageMutationFenceBindingObservationErrorCode::CurrentSelectionMismatch,
            "local_log_storage_mutation_fence_binding_observation.current_selection_mismatch",
        ),
        (
            LocalLogStorageMutationFenceBindingObservationError::PredecessorSelectionMismatch,
            LocalLogStorageMutationFenceBindingObservationErrorCode::PredecessorSelectionMismatch,
            "local_log_storage_mutation_fence_binding_observation.predecessor_selection_mismatch",
        ),
        (
            LocalLogStorageMutationFenceBindingObservationError::WriterEpochMismatch,
            LocalLogStorageMutationFenceBindingObservationErrorCode::WriterEpochMismatch,
            "local_log_storage_mutation_fence_binding_observation.writer_epoch_mismatch",
        ),
        (
            LocalLogStorageMutationFenceBindingObservationError::CurrentWriterFenceMismatch,
            LocalLogStorageMutationFenceBindingObservationErrorCode::CurrentWriterFenceMismatch,
            "local_log_storage_mutation_fence_binding_observation.current_writer_fence_mismatch",
        ),
    ];
    for (error, code, spelling) in observation_codes {
        assert_eq!(error.code(), code);
        assert_eq!(code.as_str(), spelling);
        assert!(!format!("{error:?} {error}").contains(PAYLOAD_SENTINEL));
    }

    assert_eq!(
        LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::EpochExhausted.as_str(),
        "local_log_storage_writer_fence_acquisition_preparation.epoch_exhausted"
    );
    assert_eq!(
        LocalLogStorageWriterFenceAcquisitionPreparationErrorCode::CurrentWriterFenceReused
            .as_str(),
        "local_log_storage_writer_fence_acquisition_preparation.current_writer_fence_reused"
    );
    Ok(())
}
