use std::{fmt, sync::Arc};

use super::{
    LocalLogStorageAttemptPreparationError, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedCheckpointGenerationState, LocalLogStorageSelectedRoot,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
};

/// The exact checked candidate value retained by one closed attempt plan.
pub(super) enum LocalLogStorageAttemptCandidate {
    Root,
    Rotation { context: Box<LocalLogStorageRotationAttemptContext> },
}

/// Exact prior-selection context required by one rotation attempt.
///
/// Its fields stay private to this module so sibling core actions can inspect
/// a closed plan but cannot forge or cross-wire selected-envelope facts.
pub(super) struct LocalLogStorageRotationAttemptContext {
    selected_binding: LocalLogStorageSelectedBinding,
    current_selection_json: Arc<str>,
    predecessor_selection_json: Option<Arc<str>>,
}

impl LocalLogStorageRotationAttemptContext {
    pub(super) const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        &self.selected_binding
    }

    pub(super) fn current_selection_json(&self) -> &str {
        &self.current_selection_json
    }

    pub(super) fn predecessor_selection_json(&self) -> Option<&str> {
        self.predecessor_selection_json.as_deref()
    }
}

/// One immutable, closed, byte-exact root-or-rotation attempt plan.
///
/// The plan is deliberately private-constructor and non-`Clone`. Candidate
/// JSON is only one part of complete plan identity: a root also binds its
/// database and planned scope incarnations through the candidate receipt, and
/// a rotation also binds the complete selected envelope. It owns no checkpoint
/// anchor, writer token, adapter handle, or terminal evidence.
pub(super) struct LocalLogStorageAttemptPlan {
    candidate_binding: LocalLogStorageSelectedBinding,
    candidate_json: Arc<str>,
    candidate: LocalLogStorageAttemptCandidate,
}

impl LocalLogStorageAttemptPlan {
    pub(super) fn root(
        normalized_candidate: LocalLogStorageSelectedRoot,
    ) -> Result<Self, LocalLogStorageAttemptPreparationError> {
        let (candidate_binding, candidate_json, predecessor_selection_json) =
            normalized_candidate.into_attempt_envelope();
        Self::root_from_envelope(
            candidate_binding,
            candidate_json,
            predecessor_selection_json.as_deref(),
        )
    }

    fn root_from_envelope(
        candidate_binding: LocalLogStorageSelectedBinding,
        candidate_json: Arc<str>,
        predecessor_selection_json: Option<&str>,
    ) -> Result<Self, LocalLogStorageAttemptPreparationError> {
        if candidate_binding.current_receipt().selection_kind()
            != LocalLogStorageSelectionKind::Root
            || candidate_binding.predecessor_receipt().is_some()
            || predecessor_selection_json.is_some()
        {
            return Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Root,
            });
        }
        Ok(Self {
            candidate_binding,
            candidate_json,
            candidate: LocalLogStorageAttemptCandidate::Root,
        })
    }

    pub(super) fn rotation(
        normalized_candidate: LocalLogStorageSelectedRoot,
        selected: &LocalLogStorageSelectedRoot,
    ) -> Result<Self, LocalLogStorageAttemptPreparationError> {
        let (candidate_binding, candidate_json, candidate_predecessor_json) =
            normalized_candidate.into_attempt_envelope();
        let (selected_binding, current_selection_json, predecessor_selection_json) =
            selected.snapshot_attempt_envelope();
        let rotation_context = LocalLogStorageRotationAttemptContext {
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
        };
        Self::rotation_from_envelopes(
            candidate_binding,
            candidate_json,
            candidate_predecessor_json.as_deref(),
            rotation_context,
        )
    }

    fn rotation_from_envelopes(
        candidate_binding: LocalLogStorageSelectedBinding,
        candidate_json: Arc<str>,
        candidate_predecessor_json: Option<&str>,
        rotation_context: LocalLogStorageRotationAttemptContext,
    ) -> Result<Self, LocalLogStorageAttemptPreparationError> {
        let selected_requires_predecessor = context_requires_predecessor(&rotation_context);
        if candidate_binding.current_receipt().selection_kind()
            != LocalLogStorageSelectionKind::Rotation
            || candidate_binding.checkpoint_generation().state()
                != LocalLogStorageSelectedCheckpointGenerationState::Retired
            || candidate_binding.predecessor_receipt()
                != Some(rotation_context.selected_binding.current_receipt())
            || selected_requires_predecessor
                != rotation_context.predecessor_selection_json.is_some()
            || candidate_predecessor_json != Some(rotation_context.current_selection_json.as_ref())
        {
            return Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation,
            });
        }
        Ok(Self {
            candidate_binding,
            candidate_json,
            candidate: LocalLogStorageAttemptCandidate::Rotation {
                context: Box::new(rotation_context),
            },
        })
    }

    pub(super) const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.candidate_binding.current_receipt().selection_kind()
    }

    pub(super) const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.candidate_binding.current_receipt()
    }

    pub(super) const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        &self.candidate_binding
    }

    pub(super) fn candidate_json(&self) -> &str {
        &self.candidate_json
    }

    pub(super) fn candidate_json_bytes(&self) -> usize {
        self.candidate_json.len()
    }

    pub(super) const fn candidate(&self) -> &LocalLogStorageAttemptCandidate {
        &self.candidate
    }

    pub(super) fn selected_binding(&self) -> Option<&LocalLogStorageSelectedBinding> {
        match &self.candidate {
            LocalLogStorageAttemptCandidate::Root => None,
            LocalLogStorageAttemptCandidate::Rotation { context } => {
                Some(&context.selected_binding)
            }
        }
    }

    pub(super) fn selected_current_json_bytes(&self) -> Option<usize> {
        match &self.candidate {
            LocalLogStorageAttemptCandidate::Root => None,
            LocalLogStorageAttemptCandidate::Rotation { context, .. } => {
                Some(context.current_selection_json.len())
            }
        }
    }

    pub(super) fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        match &self.candidate {
            LocalLogStorageAttemptCandidate::Root => None,
            LocalLogStorageAttemptCandidate::Rotation { context, .. } => {
                context.predecessor_selection_json.as_ref().map(|json| json.len())
            }
        }
    }

    pub(super) fn retained_json_bytes(&self) -> Option<usize> {
        match &self.candidate {
            LocalLogStorageAttemptCandidate::Root => Some(self.candidate_json.len()),
            LocalLogStorageAttemptCandidate::Rotation { context } => self
                .candidate_json
                .len()
                .checked_add(context.current_selection_json.len())
                .and_then(|total| {
                    context
                        .predecessor_selection_json
                        .as_ref()
                        .map_or(Some(total), |json| total.checked_add(json.len()))
                }),
        }
    }
}

fn context_requires_predecessor(context: &LocalLogStorageRotationAttemptContext) -> bool {
    context.selected_binding.current_receipt().selection_kind()
        == LocalLogStorageSelectionKind::Rotation
}

impl fmt::Debug for LocalLogStorageAttemptPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAttemptPlan")
            .field("selection_kind", &self.selection_kind())
            .field("candidate_binding", &self.candidate_binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .field("selected_current_json_bytes", &self.selected_current_json_bytes())
            .field("selected_predecessor_json_bytes", &self.selected_predecessor_json_bytes())
            .field("retained_json_bytes", &self.retained_json_bytes())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, sync::Arc};

    use super::{LocalLogStorageAttemptPlan, LocalLogStorageRotationAttemptContext};
    use crate::{
        codec::{
            LocalLogFrameLimits, LocalLogStorageAttemptPreparationError,
            LocalLogStorageAttemptPreparationErrorCode, LocalLogStorageAttemptRequest,
            LocalLogStorageGenerationFrameV1, LocalLogStoragePreparedAttempt,
            LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
            LocalLogStorageSelectedCheckpointGenerationBinding, LocalLogStorageSelectionKind,
            LocalLogStorageSelectionReceiptBinding,
        },
        local_log::{
            LocalLogId, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
            LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
            LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
            LocalLogStorageTransactionId, LocalSessionId,
        },
    };

    type TestResult<T = ()> = Result<T, Box<dyn Error>>;

    fn receipt(
        kind: LocalLogStorageSelectionKind,
        transaction_id: &str,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
    ) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
        Ok(LocalLogStorageSelectionReceiptBinding::try_new(
            LocalLogStorageProfileId::try_new("breditor/attempt-plan-tests")?,
            LocalLogStorageProfileVersion::try_new(1)?,
            LocalLogStorageDatabaseIncarnationId::try_new("database:attempt-plan-tests")?,
            LocalLogStorageScopeId::try_new("scope:attempt-plan-tests")?,
            LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:attempt-plan-tests")?,
            LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            kind,
            LocalSessionId::try_new("session:attempt-plan-tests")?,
        )?)
    }

    fn root_binding() -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0")?,
            None,
            LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                LocalLogId::try_new("log:g0")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageHeadId::try_new("head:h0")?,
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                LocalLogId::try_new("log:g1")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(4_096)),
                LocalLogStorageFenceId::try_new("fence:f0")?,
                LocalLogStorageHeadId::try_new("head:h0")?,
            ),
        )?)
    }

    fn first_rotation_binding() -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(
                LocalLogStorageSelectionKind::Rotation,
                "transaction:t1",
                Some("head:h0"),
                "head:h1",
            )?,
            Some(receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0")?),
            LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                LocalLogId::try_new("log:g1")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(4_096)),
                LocalLogStorageFenceId::try_new("fence:f0")?,
                LocalLogStorageHeadId::try_new("head:h0")?,
                LocalLogStorageHeadId::try_new("head:h1")?,
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                LocalLogId::try_new("log:g2")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
                LocalLogStorageFenceId::try_new("fence:f1")?,
                LocalLogStorageHeadId::try_new("head:h1")?,
            ),
        )?)
    }

    fn second_rotation_binding() -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(
                LocalLogStorageSelectionKind::Rotation,
                "transaction:t2",
                Some("head:h1"),
                "head:h2",
            )?,
            Some(receipt(
                LocalLogStorageSelectionKind::Rotation,
                "transaction:t1",
                Some("head:h0"),
                "head:h1",
            )?),
            LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                LocalLogId::try_new("log:g2")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
                LocalLogStorageFenceId::try_new("fence:f1")?,
                LocalLogStorageHeadId::try_new("head:h1")?,
                LocalLogStorageHeadId::try_new("head:h2")?,
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                LocalLogId::try_new("log:g3")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(16_384)),
                LocalLogStorageFenceId::try_new("fence:f2")?,
                LocalLogStorageHeadId::try_new("head:h2")?,
            ),
        )?)
    }

    fn second_rotation_reclaimed_binding() -> TestResult<LocalLogStorageSelectedBinding> {
        Ok(LocalLogStorageSelectedBinding::try_new(
            receipt(
                LocalLogStorageSelectionKind::Rotation,
                "transaction:t2",
                Some("head:h1"),
                "head:h2",
            )?,
            Some(receipt(
                LocalLogStorageSelectionKind::Rotation,
                "transaction:t1",
                Some("head:h0"),
                "head:h1",
            )?),
            LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
                LocalLogId::try_new("log:g2")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
                LocalLogStorageFenceId::try_new("fence:f1")?,
                LocalLogStorageHeadId::try_new("head:h1")?,
                LocalLogStorageHeadId::try_new("head:h2")?,
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                LocalLogId::try_new("log:g3")?,
                LocalSessionId::try_new("session:attempt-plan-tests")?,
                LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(16_384)),
                LocalLogStorageFenceId::try_new("fence:f2")?,
                LocalLogStorageHeadId::try_new("head:h2")?,
            ),
        )?)
    }

    #[test]
    #[allow(clippy::too_many_lines)]
    fn private_constructors_fail_closed_on_every_shape_mismatch() -> TestResult {
        let error = LocalLogStorageAttemptPlan::root_from_envelope(
            first_rotation_binding()?,
            Arc::from("CANDIDATEPAYLOADSENTINEL"),
            None,
        )
        .err()
        .ok_or("root plan accepted a rotation binding")?;
        assert!(matches!(
            error,
            LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Root
            }
        ));
        assert_eq!(error.code(), LocalLogStorageAttemptPreparationErrorCode::RuntimeInvariant);
        assert_redacted(&format!("{error:?}"));
        assert_redacted(&error.to_string());

        assert!(matches!(
            LocalLogStorageAttemptPlan::root_from_envelope(
                root_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("PREDECESSORPAYLOADSENTINEL"),
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Root
            })
        ));

        let root_context = LocalLogStorageRotationAttemptContext {
            selected_binding: root_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: None,
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                root_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("CURRENTPAYLOADSENTINEL"),
                root_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));

        let missing_predecessor_context = LocalLogStorageRotationAttemptContext {
            selected_binding: first_rotation_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: None,
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                second_rotation_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("CURRENTPAYLOADSENTINEL"),
                missing_predecessor_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));

        let extra_predecessor_context = LocalLogStorageRotationAttemptContext {
            selected_binding: root_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: Some(Arc::from("PREDECESSORPAYLOADSENTINEL")),
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                first_rotation_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("CURRENTPAYLOADSENTINEL"),
                extra_predecessor_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));

        let wrong_receipt_context = LocalLogStorageRotationAttemptContext {
            selected_binding: root_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: None,
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                second_rotation_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("CURRENTPAYLOADSENTINEL"),
                wrong_receipt_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));

        let wrong_bytes_context = LocalLogStorageRotationAttemptContext {
            selected_binding: first_rotation_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: Some(Arc::from("PREDECESSORPAYLOADSENTINEL")),
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                second_rotation_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("WRONGCURRENTPAYLOADSENTINEL"),
                wrong_bytes_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));

        let reclaimed_candidate_context = LocalLogStorageRotationAttemptContext {
            selected_binding: first_rotation_binding()?,
            current_selection_json: Arc::from("CURRENTPAYLOADSENTINEL"),
            predecessor_selection_json: Some(Arc::from("PREDECESSORPAYLOADSENTINEL")),
        };
        assert!(matches!(
            LocalLogStorageAttemptPlan::rotation_from_envelopes(
                second_rotation_reclaimed_binding()?,
                Arc::from("CANDIDATEPAYLOADSENTINEL"),
                Some("CURRENTPAYLOADSENTINEL"),
                reclaimed_candidate_context,
            ),
            Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Rotation
            })
        ));
        Ok(())
    }

    #[test]
    fn every_payload_bearing_debug_boundary_omits_distinct_sentinels() -> TestResult {
        const CANDIDATE: &str = "CANDIDATEPAYLOADSENTINEL";
        const CURRENT: &str = "CURRENTPAYLOADSENTINEL";
        const PREDECESSOR: &str = "PREDECESSORPAYLOADSENTINEL";
        let plan = LocalLogStorageAttemptPlan::rotation_from_envelopes(
            second_rotation_binding()?,
            Arc::from(CANDIDATE),
            Some(CURRENT),
            LocalLogStorageRotationAttemptContext {
                selected_binding: first_rotation_binding()?,
                current_selection_json: Arc::from(CURRENT),
                predecessor_selection_json: Some(Arc::from(PREDECESSOR)),
            },
        )?;
        let prepared = LocalLogStoragePreparedAttempt::new(plan);
        assert_redacted(&format!("{prepared:?}"));

        let mut uncertain = prepared.begin_attempt();
        assert_redacted(&format!("{uncertain:?}"));
        let request = uncertain.adapter_request()?;
        assert_redacted(&format!("{request:?}"));
        let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
            return Err("rotation plan yielded a root request".into());
        };
        assert_redacted(&format!("{rotation:?}"));
        assert_eq!(rotation.candidate_json(), CANDIDATE);
        assert_eq!(rotation.selected_current_json(), CURRENT);
        assert_eq!(rotation.selected_predecessor_json(), Some(PREDECESSOR));
        Ok(())
    }

    fn assert_redacted(debug: &str) {
        for sentinel in
            ["CANDIDATEPAYLOADSENTINEL", "CURRENTPAYLOADSENTINEL", "PREDECESSORPAYLOADSENTINEL"]
        {
            assert!(!debug.contains(sentinel), "debug leaked {sentinel}: {debug}");
        }
    }
}
