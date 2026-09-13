use super::*;
use crate::codec::{
    LocalLogStorageRootReadbackErrorV3 as Error, LocalLogStorageRootReadbackEvidenceV3 as Evidence,
};
use crate::local_log::{LocalLogStorageRootResolutionRequestId, LocalLogStorageTransactionId};

#[test]
fn exact_snapshot_preserves_every_source_kind_and_redacts_payload() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    for kind in [
        None,
        Some(TerminalKind::PublicationCompleted),
        Some(TerminalKind::TransactionAborted),
        Some(TerminalKind::NotAttempted),
    ] {
        for issued in [false, true] {
            if !issued
                && matches!(
                    kind,
                    Some(TerminalKind::PublicationCompleted | TerminalKind::TransactionAborted)
                )
            {
                continue;
            }
            let mut attempt = publication_plan(&fixture)?.begin_attempt();
            let attempt_id = attempt.attempt_id().clone();
            let request =
                if issued { Some(attempt.adapter_request()?.request_id().clone()) } else { None };
            let mut probe = match kind {
                None => attempt.begin_readback(),
                Some(kind) => {
                    let claim = match kind {
                        TerminalKind::NotAttempted => Attestation::not_attempted(&attempt_id),
                        TerminalKind::PublicationCompleted => Attestation::publication_completed(
                            request.as_ref().ok_or("missing request")?,
                        ),
                        TerminalKind::TransactionAborted => Attestation::transaction_aborted(
                            request.as_ref().ok_or("missing request")?,
                        ),
                    };
                    attempt.observe_terminal_attestation(claim)?.begin_readback()
                }
            };
            assert_eq!(probe.source_attempt_id(), &attempt_id);
            assert_eq!(probe.source_terminal_kind(), kind);
            assert_eq!(probe.source_request_issued(), issued);
            assert!(!probe.request_issued());
            let json = fixture.encoded_root()?;
            let probe_id = {
                let view = probe.adapter_request()?;
                assert_eq!(view.candidate_json(), json);
                assert_eq!(
                    view.candidate_binding(),
                    publication_plan(&fixture)?.candidate_binding()
                );
                assert!(!format!("{view:?}").contains("STORAGEV3PAYLOADSENTINEL"));
                view.request_id().clone()
            };
            assert!(matches!(
                probe.adapter_request(),
                Err(TransitionError::RequestAlreadyBorrowed)
            ));
            let selected = fixture.normalize_root(&json)?;
            let tx = selected.transaction_id().clone();
            let evidence = Evidence::transaction_completed(&probe_id, selected, tx);
            assert!(!format!("{evidence:?}").contains("STORAGEV3PAYLOADSENTINEL"));
            let matched = probe.observe_selected(evidence)?;
            assert_eq!(matched.source().source_attempt_id(), &attempt_id);
            assert_eq!(matched.source().source_terminal_kind(), kind);
            assert_eq!(matched.source().source_request_issued(), issued);
            assert!(matched.source().plan().same_plan_as(&publication_plan(&fixture)?));
            assert_eq!(matched.selected().current_selection_json_bytes(), json.len());
            assert!(!format!("{matched:?}").contains("STORAGEV3PAYLOADSENTINEL"));
        }
    }
    Ok(())
}

#[test]
fn foreign_probe_evidence_is_losslessly_rejected_and_can_reach_its_owner() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let mut first = publication_plan(&fixture)?.begin_attempt().begin_readback();
    let mut second = publication_plan(&fixture)?.begin_attempt().begin_readback();
    let first_id = first.adapter_request()?.request_id().clone();
    let second_id = second.adapter_request()?.request_id().clone();
    assert_ne!(first_id, second_id);
    let selected = fixture.normalize_root(&fixture.encoded_root()?)?;
    let tx = selected.transaction_id().clone();
    let evidence = Evidence::transaction_completed(&second_id, selected, tx);
    let failure = first.observe_selected(evidence).err().ok_or("accepted foreign probe")?;
    assert_eq!(failure.error(), Error::RequestIdMismatch);
    assert!(!format!("{failure:?}").contains("STORAGEV3PAYLOADSENTINEL"));
    let (mut first, evidence, _) = failure.into_parts();
    assert_eq!(evidence.request_id(), &second_id);
    assert!(first.plan().same_plan_as(&publication_plan(&fixture)?));
    assert!(matches!(first.adapter_request(), Err(TransitionError::RequestAlreadyBorrowed)));
    let _ = second.observe_selected(evidence)?;
    Ok(())
}

#[test]
fn request_index_and_exact_payload_checks_preserve_uncertainty() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let json = fixture.encoded_root()?;
    for case in 0..4 {
        let mut probe = publication_plan(&fixture)?.begin_attempt().begin_readback();
        let id = if case == 0 {
            LocalLogStorageRootResolutionRequestId::new()
        } else {
            probe.adapter_request()?.request_id().clone()
        };
        let changed = json.replace("STORAGEV3PAYLOADSENTINEL", "CHANGEDV3PAYLOADSENTINEL");
        assert_eq!(changed.len(), json.len());
        let selected = if case == 2 {
            fixture.normalize_root(&changed)?
        } else if case == 3 {
            let mut other = StorageV3Fixture::new()?;
            other.database_incarnation_id =
                LocalLogStorageDatabaseIncarnationId::try_new("other-database")?;
            other.normalize_root(&json)?
        } else {
            fixture.normalize_root(&json)?
        };
        let tx = if case == 1 {
            LocalLogStorageTransactionId::try_new("wrong-index")?
        } else {
            selected.transaction_id().clone()
        };
        let evidence = Evidence::transaction_completed(&id, selected, tx);
        let failure = probe.observe_selected(evidence).err().ok_or("accepted invalid readback")?;
        assert_eq!(
            failure.error(),
            match case {
                0 => Error::RequestNotIssued,
                1 => Error::HeadIndexMismatch,
                _ => Error::CandidateMismatch,
            }
        );
        let (mut retained, evidence, _) = failure.into_parts();
        assert_eq!(evidence.request_id(), &id);
        assert_eq!(retained.request_issued(), case != 0);
        assert_eq!(retained.source_terminal_kind(), None);
        assert!(retained.plan().same_plan_as(&publication_plan(&fixture)?));
        let id = if case == 0 { retained.adapter_request()?.request_id().clone() } else { id };
        let exact = fixture.normalize_root(&json)?;
        let tx = exact.transaction_id().clone();
        let _ = retained.observe_selected(Evidence::transaction_completed(&id, exact, tx))?;
    }
    Ok(())
}
