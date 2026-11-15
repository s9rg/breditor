//! Private test pipe for a live old relay. The owner token stays off disk and out of responses.
use super::{Result, configured_auth, deployment, read, restored_backup, storage};
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RelaySegmentClientJournal, RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive,
    RelaySegmentClientUploadPin, RelaySegmentJournalOwner, RoomRecoveryPolicy,
    server::{
        Authentication, ContentAddressedServerAssets, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, ServerBackupHandle, ServerRecoveryAssetProvider,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{BufRead, Read, Write},
    path::Path,
    sync::Arc,
};

#[path = "handover/branches.rs"]
mod branches;
#[path = "handover/provider.rs"]
mod provider;

const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    #[serde(rename_all = "camelCase")]
    Handover {
        token: String,
        writer: String,
        document_credential: String,
        actor: String,
        review_credential: String,
        peer_writer: String,
        peer_credential: String,
        uploads: Vec<RelaySegmentClientUploadPin>,
        journals: Vec<RelaySegmentClientJournalPin>,
        wrong_receipt: RelaySegmentClientJournalPin,
        asset_mapping: Option<provider::Selection>,
        incoming_branch: Option<RelaySegmentClientJournalPin>,
    },
    #[serde(rename_all = "camelCase")]
    Resume {
        token: String,
        #[serde(default)]
        export_alternates: bool,
    },
}

fn input() -> Result<Vec<u8>> {
    let stdin = std::io::stdin();
    let mut line = Vec::new();
    stdin.lock().take(8193).read_until(b'\n', &mut line)?;
    if line.len() > 8192 || line.last() != Some(&b'\n') {
        return Err("private relay segment command bounds".into());
    }
    Ok(line)
}

fn prepare_and_commit(
    parent: &Path,
    handle: &ServerBackupHandle,
    token: &str,
    credentials: &RecoveryRegistrationCredentials,
    uploads: &[RelaySegmentClientUploadPin],
    journals: &[RelaySegmentClientJournalPin],
    wrong_receipt: RelaySegmentClientJournalPin,
    asset_mapping: Option<provider::Selection>,
    incoming_branch: Option<RelaySegmentClientJournalPin>,
) -> Result<Value> {
    let (expected, previous) =
        handle.capture_relay_segment("owner", token, &parent.join("capture"))?;
    storage::write_new(&parent.join("restore.json"), &serde_json::to_vec(&expected)?)?;
    if journals.len() != 2 || wrong_receipt.owner != journals[0].owner {
        return Err("expected one paired SDK archive and one independent document".into());
    }
    let participant =
        matches!(journals[0].owner, RelaySegmentJournalOwner::IndependentParticipant { .. });
    if uploads.len() != 2 - usize::from(participant) {
        return Err("expected both writer uploads, including any nested archive".into());
    }
    let mut archives = Vec::new();
    for pin in uploads {
        if pin.writer != "2" && pin.writer != "3" {
            return Err("unexpected fixture writer".into());
        }
        let file = File::open(parent.join(format!("client-{}.backup", pin.writer)))?;
        archives.push(RelaySegmentClientUploadArchive::open(file, pin.clone())?);
    }
    let originals = journals
        .iter()
        .enumerate()
        .map(|(index, pin)| {
            let file = File::open(parent.join(format!("journal-{index}.json")))?;
            RelaySegmentClientJournal::open(file, pin.clone())
        })
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let backup = restored_backup(parent)?;
    let authentication = configured_auth(parent)?;
    let branch_report = incoming_branch
        .as_ref()
        .map(|incoming| {
            branches::inspect(
                parent,
                handle,
                &authentication,
                token,
                credentials,
                &expected,
                &previous,
                &backup,
                &archives,
                &originals,
                &journals[1],
                incoming.clone(),
            )
        })
        .transpose()?;
    let alternative = incoming_branch
        .as_ref()
        .map(|pin| {
            RelaySegmentClientJournal::open(
                File::open(parent.join("incoming-branch.bin"))?,
                pin.clone(),
            )
        })
        .transpose()?;
    let alternatives = alternative.as_slice();
    if let Some(pin) = &incoming_branch {
        branches::check_retention(parent, &backup, &archives, &originals, alternatives, pin)?;
    }
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    {
        let wrong = RelaySegmentClientJournal::open(
            File::open(parent.join("wrong-receipt.json"))?,
            wrong_receipt,
        )?;
        let peer_file = File::open(parent.join("journal-1.json"))?;
        let peer = RelaySegmentClientJournal::open(peer_file, journals[1].clone())?;
        let mut target = backup.restore_with_client_journals(
            &parent.join("invalid-client-receipt"),
            "invalid-receipt",
            POLICY,
            &archives,
            &[wrong, peer],
        )?;
        if !matches!(
            target.verify_handover_inputs(&authentication, "owner", token, credentials, &provider),
            Err(breditor_collab_relay::Error::Contract(
                "paired client review receipt sequence differs"
            ))
        ) {
            return Err("a fabricated paired review receipt sequence was not refused".into());
        }
    }
    let mut target = backup.restore_with_client_journal_alternatives(
        &parent.join("restored"),
        "restored-one",
        POLICY,
        &archives,
        &originals,
        alternatives,
    )?;
    if participant {
        let mut copy = Vec::new();
        assert!(target.copy_client_archive(&journals[0], &mut copy)?);
        assert_eq!(copy, std::fs::read(parent.join("journal-0.json"))?);
    }
    let mapped = asset_mapping
        .map(|selection| {
            provider::Provider::prepare(selection, &mut target, &authentication, token, credentials)
        })
        .transpose()?;
    let provider: Arc<dyn ServerRecoveryAssetProvider> =
        mapped.as_ref().map_or(provider, |selected| selected.clone());
    let pending = target.verify_handover_inputs(
        &authentication,
        "owner",
        token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(pending) = pending else {
        return Err("missing protected inputs were accepted".into());
    };
    assert_eq!(pending.missing_registrations.len(), 3);
    let mut incomplete = backup.restore_with_client_journals(
        &parent.join("incomplete-uploads"),
        "unused-one",
        POLICY,
        &archives[..archives.len() - 1],
        &originals,
    )?;
    let incomplete = incomplete.verify_handover_inputs(
        &authentication,
        "owner",
        token,
        credentials,
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(incomplete) = incomplete else {
        return Err("missing client upload archive was accepted".into());
    };
    assert_eq!(incomplete.missing_upload_writers, [credentials.documents[1].writer.clone()]);
    assert!(
        incomplete
            .client_journal_coverage
            .as_ref()
            .is_some_and(|coverage| coverage.missing_document_writers.is_empty()
                && coverage.missing_review_actors.is_empty())
    );
    let mut missing_journals = backup.restore_with_client_journals(
        &parent.join("incomplete-journals"),
        "unused-two",
        POLICY,
        &archives,
        &originals[1..],
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(missing_journals) = missing_journals
        .verify_handover_inputs(&authentication, "owner", token, credentials, &provider)?
    else {
        return Err("missing native journals were accepted".into());
    };
    if participant {
        assert_eq!(
            missing_journals.missing_upload_writers,
            [credentials.documents[0].writer.clone()]
        );
    } else {
        assert!(missing_journals.missing_upload_writers.is_empty());
    }
    assert!(missing_journals.missing_registrations.is_empty());
    assert!(missing_journals.missing_assets.is_empty());
    let incomplete_journals =
        missing_journals.client_journal_coverage.as_ref().ok_or("incomplete journal report")?;
    assert_eq!(
        incomplete_journals.missing_document_writers,
        [credentials.documents[0].writer.clone()]
    );
    assert_eq!(incomplete_journals.missing_review_actors, [credentials.reviews[0].actor.clone()]);
    let coverage =
        target.verify_handover_inputs(&authentication, "owner", token, credentials, &provider)?;
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = coverage else {
        return Err("original protected or provider inputs are incomplete".into());
    };
    let alternate_branches = &inputs.report().alternate_branches;
    if let Some(pin) = &incoming_branch {
        assert_eq!(inputs.report().format_version, 4);
        assert_eq!(alternate_branches.len(), 1);
        assert_eq!(alternate_branches[0].pin, *pin);
        assert!(!alternate_branches[0].document.prefix_matches);
        assert!(!alternate_branches[0].review.prefix_matches);
    } else {
        assert!(alternate_branches.is_empty());
        assert_eq!(inputs.report().format_version, 3);
    }
    let verified_journals =
        inputs.report().client_journal_coverage.as_ref().ok_or("verified journal report")?;
    assert_eq!(verified_journals.journals.len(), 2);
    let document = &verified_journals.journals[0];
    assert!(document.local_through.parse::<u64>()? > document.accepted_through.parse::<u64>()?);
    let review = document.paired_review.as_ref().ok_or("paired review head")?;
    assert!(review.local_through.parse::<u64>()? > review.accepted_through.parse::<u64>()?);
    assert!(verified_journals.journals[1].paired_review.is_none());
    let approval =
        RelaySegmentHandoverApproval::select_verified(&target, &inputs, previous.clone())?;
    if let Some(mapping) = &mapped {
        mapping.select(false);
        let refused = handle.commit_verified_relay_segment_handover(
            "owner",
            token,
            target,
            configured_auth(parent)?,
            &approval,
            &inputs,
        );
        if !provider::Provider::is_disagreement(&refused) {
            return Err("the changed mapped raster was accepted at the commit boundary".into());
        }
        assert_eq!(deployment(parent)?.current_selection()?, previous);
        mapping.select(true);
        target = backup.reopen(&parent.join("restored"), POLICY)?;
    }
    storage::write_new(&parent.join("approval.json"), &serde_json::to_vec(&approval)?)?;
    File::open(parent)?.sync_all()?;
    let (router, handle, selected) = handle.commit_verified_relay_segment_handover(
        "owner",
        token,
        target,
        authentication,
        &approval,
        &inputs,
    )?;
    assert_eq!(selected, approval.planned_selection()?);
    drop(router);
    drop(handle);
    Ok(json!({
        "kind":"committed", "records":approval.backup().native.predecessor.source.records,
        "registrationRefusals": pending.missing_registrations.len(),
        "providerRasters": inputs.report().assets.len(),
        "retainedPackets": inputs.report().references.sources.len(),
        "clientRasters": inputs.report().client_rasters.len(),
        "clientArchives": inputs.report().client_upload_archives.as_ref().ok_or("upload cohort")?.len(),
        "missingArchiveRefusals": incomplete.missing_upload_writers.len(),
        "nativeJournals": verified_journals.journals.len() + 1,
        "pairedBackups": usize::from(matches!(journals[0].owner, breditor_collab_relay::RelaySegmentJournalOwner::PairedSession { .. })),
        "independentDeliveries": usize::from(matches!(journals[0].owner, breditor_collab_relay::RelaySegmentJournalOwner::IndependentDelivery { .. })),
        "participantArchives": usize::from(participant),
        "branchAdmissions": branch_report.as_ref().map(|row| &row["admissions"]),
        "branchCutRefusals": branch_report.as_ref().map(|row| &row["refusedCuts"]),
        "incomingBranchRefusals": branch_report.as_ref().map(|row| &row["refusedIncoming"]),
        "preservedAlternateArchives": alternate_branches.len(),
        "alteredAlternateRefusals": usize::from(incoming_branch.is_some()),
        "participantUnmapped": usize::from(mapped.is_some()),
        "participantMappingRefusals": 2 * usize::from(mapped.is_some()),
        "participantRasterBindings": verified_journals.participant_raster_bindings.len(),
        "wrongReceiptRefusals": 1,
        "clientJournalRasterBindings": verified_journals.asset_references.len(),
        "missingJournalRefusals": incomplete_journals.missing_document_writers.len()
            + incomplete_journals.missing_review_actors.len(),
    }))
}

pub(super) fn serve_control(
    parent: &Path,
    handle: ServerBackupHandle,
) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_owned();
    tokio::task::spawn_blocking(move || {
        let Command::Handover {
            token,
            writer,
            document_credential,
            actor,
            review_credential,
            peer_writer,
            peer_credential,
            uploads,
            journals,
            wrong_receipt,
            asset_mapping,
            incoming_branch,
        } = serde_json::from_slice(&input()?)?
        else {
            return Err("expected private handover command".into());
        };
        let credentials = RecoveryRegistrationCredentials {
            documents: vec![
                RecoveryDocumentCredential {
                    principal: "owner".into(),
                    writer,
                    credential: document_credential,
                },
                RecoveryDocumentCredential {
                    principal: "owner".into(),
                    writer: peer_writer,
                    credential: peer_credential,
                },
            ],
            reviews: vec![RecoveryReviewCredential {
                principal: "owner".into(),
                actor,
                credential: review_credential,
            }],
        };
        let response = prepare_and_commit(
            &parent,
            &handle,
            &token,
            &credentials,
            &uploads,
            &journals,
            wrong_receipt,
            asset_mapping,
            incoming_branch,
        )?;
        {
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "{response}")?;
            stdout.flush()?;
        }
        // Keep serving the superseded old listener until the caller checks it and exits.
        let _ = std::io::stdin().lock().read(&mut [0; 1]);
        Ok(())
    })
}

pub(super) fn resumed_router(
    parent: &Path,
    authentication: Authentication,
) -> Result<axum::Router> {
    let Command::Resume { token, export_alternates } = serde_json::from_slice(&input()?)? else {
        return Err("expected private resume command".into());
    };
    let authority = deployment(parent)?;
    let approval: RelaySegmentHandoverApproval =
        serde_json::from_str(&read(&parent.join("approval.json"), 32 * 1024)?)?;
    let target = restored_backup(parent)?.reopen(&parent.join("restored"), POLICY)?;
    let selected = authority.current_selection()?;
    let (router, handle, epoch) = target.resume_handover(
        authentication,
        "owner",
        &token,
        &authority,
        &approval,
        &selected,
    )?;
    if export_alternates {
        branches::export(parent, &handle, &token, &selected, &epoch)?;
    }
    Ok(router)
}
