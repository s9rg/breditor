//! A second live handover from the first replacement and an independently exported alternate.
use super::{
    POLICY, PeerReviewCredential, Result, configured_auth, deployment, input, peer_principal, read,
    storage,
};
use crate::{captured_base, original_capture};
use breditor_collab_relay::{
    Error, RecoveredRelaySegmentRoom, RecoveryDocumentCredential, RecoveryRegistrationCredentials,
    RecoveryReviewCredential, RelaySegmentClientJournal, RelaySegmentClientJournalPin,
    RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin, RelaySegmentRoomBackupFiles,
    server::{
        ContentAddressedServerAssets, RelaySegmentDiscussionBackup,
        RelaySegmentDiscussionBackupIdentity, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, ServerBackupHandle, ServerRecoveryAssetProvider,
        VerifiedRelaySegmentHandoverInputs,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
    sync::Arc,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Carry {
    token: String,
    writer: String,
    document_credential: String,
    actor: String,
    review_credential: String,
    peer_writer: String,
    peer_credential: String,
    #[serde(default = "peer_principal")]
    peer_principal: String,
    peer_review: Option<PeerReviewCredential>,
    peer_upload: RelaySegmentClientUploadPin,
    journals: [RelaySegmentClientJournalPin; 2],
    alternate: RelaySegmentClientJournalPin,
    additional_alternate: Option<RelaySegmentClientJournalPin>,
    #[serde(default)]
    discussion_backup: bool,
    #[serde(default)]
    seal_portable: bool,
}

pub(super) fn backup(parent: &Path) -> Result<RelaySegmentRoomBackupFiles> {
    let (prior, _) = original_capture(parent)?;
    let capture = parent.join("carry-capture");
    let bundle = parent.join("carry-discussion-backup.json");
    if bundle.exists() {
        let identity = serde_json::from_str(&read(&bundle, 32 * 1024)?)?;
        return Ok(RelaySegmentDiscussionBackup::open(&capture, Some(prior), &identity)?.backup);
    }
    let (current, identity) = captured_base(&capture, &parent.join("carry-restore.json"), prior)?;
    Ok(RelaySegmentRoomBackupFiles::open(
        current,
        File::open(capture.join("rasters.archive"))?,
        &identity,
    )?)
}

impl Carry {
    fn commit(self, parent: &Path, handle: &ServerBackupHandle) -> Result<Value> {
        let principal = "owner";
        let capture_path = parent.join("carry-capture");
        let bundle = self
            .discussion_backup
            .then(|| {
                handle.capture_relay_segment_with_discussion_sources(
                    principal,
                    &self.token,
                    &capture_path,
                )
            })
            .transpose()?;
        let (captured, old_epoch) = if let Some(identity) = &bundle {
            assert_eq!(identity.discussion_sources, std::slice::from_ref(&self.alternate));
            storage::write_new(
                &parent.join("carry-discussion-backup.json"),
                &serde_json::to_vec(identity)?,
            )?;
            assert!(matches!(
                handle.capture_relay_segment_with_discussion_sources(principal, &self.token, &capture_path),
                Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::AlreadyExists
            ));
            (identity.backup.clone(), identity.source_epoch.clone())
        } else {
            handle.capture_relay_segment(principal, &self.token, &capture_path)?
        };
        let retained_backup = self
            .discussion_backup
            .then(|| super::retained_backup::verify(parent, handle, &self.token, &self.peer_upload))
            .transpose()?;
        if let Some(identity) = &retained_backup {
            assert_eq!(identity.retained.backup, captured);
            assert_eq!(identity.retained.source_epoch, old_epoch);
        }
        storage::write_new(&parent.join("carry-restore.json"), &serde_json::to_vec(&captured)?)?;
        let mut credentials = RecoveryRegistrationCredentials {
            documents: vec![
                RecoveryDocumentCredential {
                    principal: principal.into(),
                    writer: self.writer,
                    credential: self.document_credential,
                },
                RecoveryDocumentCredential {
                    principal: self.peer_principal.clone(),
                    writer: self.peer_writer,
                    credential: self.peer_credential,
                },
            ],
            reviews: vec![RecoveryReviewCredential {
                principal: principal.into(),
                actor: self.actor,
                credential: self.review_credential,
            }],
        };
        if let Some(peer) = self.peer_review {
            credentials.reviews.push(RecoveryReviewCredential {
                principal: self.peer_principal,
                actor: peer.actor,
                credential: peer.credential,
            });
        }
        let journals = self
            .journals
            .into_iter()
            .enumerate()
            .map(|(index, pin)| {
                RelaySegmentClientJournal::open(
                    File::open(parent.join(format!("carry-journal-{index}.json")))?,
                    pin,
                )
            })
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let peer_upload = RelaySegmentClientUploadArchive::open(
            File::open(parent.join("carry-peer.uploads"))?,
            self.peer_upload,
        )?;
        let additional = self
            .additional_alternate
            .as_ref()
            .map(|pin| {
                RelaySegmentClientJournal::open(
                    File::open(parent.join("additional-alternate.bin"))?,
                    pin.clone(),
                )
            })
            .transpose()?;
        let (backup, bundled_alternate) = if let Some(identity) = &bundle {
            let (prior, _) = original_capture(parent)?;
            let complete: RelaySegmentDiscussionBackupIdentity = serde_json::from_str(&read(
                &parent.join("carry-discussion-backup.json"),
                32 * 1024,
            )?)?;
            assert_eq!(&complete, identity);
            let mut incomplete = complete.clone();
            incomplete.discussion_sources.clear();
            assert!(matches!(
                RelaySegmentDiscussionBackup::open(&capture_path, Some(prior.clone()), &incomplete),
                Err(Error::Contract("relay discussion backup source roster differs"))
            ));
            let file = capture_path.join("discussion-sources/0.participant");
            let held = capture_path.join("discussion-sources/held.participant");
            std::fs::rename(&file, &held)?;
            let missing =
                RelaySegmentDiscussionBackup::open(&capture_path, Some(prior.clone()), &complete);
            std::fs::rename(&held, &file)?;
            assert!(
                matches!(missing, Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound)
            );
            let reopened =
                RelaySegmentDiscussionBackup::open(&capture_path, Some(prior), &complete)?;
            let mut files = reopened.discussion_sources.into_iter();
            let alternate = files.next().ok_or("missing bundled discussion original")?;
            assert!(files.next().is_none());
            (reopened.backup, Some(alternate))
        } else {
            (backup(parent)?, None)
        };
        let required_sources = backup.required_recovered_discussion_sources()?;
        let mut published_source_refusals = 0;
        let source_path = if required_sources.is_empty() {
            parent.join("exported-alternates/0.participant")
        } else {
            assert_eq!(required_sources, [self.alternate.sha256]);
            let unpacked = parent.join("missing-published-sources");
            assert!(matches!(
                backup.restore(&unpacked, "no-published-sources", POLICY),
                Err(Error::Contract("relay segment restore omitted a recovered discussion source"))
            ));
            assert!(!unpacked.exists());
            published_source_refusals += 1;
            let wrong = parent.join("unreferenced-discussion-sources");
            let wrong_digest = [self.alternate.sha256.map(|byte| !byte)];
            assert!(matches!(
                handle.export_relay_segment_recovered_discussion_sources(
                    principal,
                    &self.token,
                    &old_epoch,
                    &wrong_digest,
                    &wrong,
                ),
                Err(Error::Contract("recovered discussion source is not published"))
            ));
            assert!(!wrong.exists());
            let destination = parent.join("published-discussion-sources");
            let exported = handle.export_relay_segment_recovered_discussion_sources(
                principal,
                &self.token,
                &old_epoch,
                &required_sources,
                &destination,
            )?;
            assert_eq!(exported, std::slice::from_ref(&self.alternate));
            destination.join("0.participant")
        };
        let alternate = match bundled_alternate {
            Some(alternate) => alternate,
            None => {
                RelaySegmentClientJournal::open(File::open(source_path)?, self.alternate.clone())?
            }
        };
        let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
        let verify =
            |target: &mut RecoveredRelaySegmentRoom| -> Result<VerifiedRelaySegmentHandoverInputs> {
                let coverage = target.verify_handover_inputs(
                    &configured_auth(parent)?,
                    principal,
                    &self.token,
                    &credentials,
                    &provider,
                )?;
                match coverage {
                    RelaySegmentHandoverInputCoverage::Verified(inputs) => Ok(inputs),
                    RelaySegmentHandoverInputCoverage::Pending(_) => {
                        Err("second handover inputs unexpectedly pending".into())
                    }
                }
            };
        let omitted_path = parent.join("omitted-alternate");
        let omitted = backup.restore_with_client_journal_alternatives(
            &omitted_path,
            "omitted-alternate",
            POLICY,
            std::slice::from_ref(&peer_upload),
            &journals,
            additional.as_slice(),
        );
        if required_sources.is_empty() {
            let mut omitted = omitted?;
            let inputs = verify(&mut omitted)?;
            let approval = RelaySegmentHandoverApproval::select_verified(
                &omitted,
                &inputs,
                old_epoch.clone(),
            )?;
            let refused = handle.commit_verified_relay_segment_handover(
                principal,
                &self.token,
                omitted,
                configured_auth(parent)?,
                &approval,
                &inputs,
            );
            assert!(matches!(
                refused,
                Err(Error::Contract("relay segment handover omitted a retained alternate"))
            ));
        } else {
            assert!(matches!(
                omitted,
                Err(Error::Contract("relay segment restore omitted a recovered discussion source"))
            ));
            assert!(!omitted_path.exists());
            published_source_refusals += 1;
        }
        assert_eq!(deployment(parent)?.current_selection()?, old_epoch);

        let mut alternatives = vec![(self.alternate, alternate)];
        if let Some(pair) = self.additional_alternate.zip(additional) {
            alternatives.push(pair);
            alternatives.sort_unstable_by_key(|(pin, _)| pin.sha256);
        }
        let (pins, alternatives): (Vec<_>, Vec<_>) = alternatives.into_iter().unzip();
        let mut target = backup.restore_with_client_journal_alternatives(
            &parent.join("carried"),
            "carried-one",
            POLICY,
            &[peer_upload],
            &journals,
            &alternatives,
        )?;
        let inputs = verify(&mut target)?;
        let branches = &inputs.report().alternate_branches;
        assert_eq!(branches.len(), pins.len());
        for (branch, pin) in branches.iter().zip(&pins) {
            assert_eq!(branch.pin, *pin);
            assert!(!branch.document.prefix_matches);
            assert!(!branch.review.prefix_matches);
        }
        let approval = RelaySegmentHandoverApproval::select_verified(&target, &inputs, old_epoch)?;
        storage::write_new(&parent.join("carry-approval.json"), &serde_json::to_vec(&approval)?)?;
        File::open(parent)?.sync_all()?;
        let (_, carried, epoch) = handle.commit_verified_relay_segment_handover(
            principal,
            &self.token,
            target,
            configured_auth(parent)?,
            &approval,
            &inputs,
        )?;
        assert_eq!(epoch, approval.planned_selection()?);
        let portable_seal = self
            .seal_portable
            .then(|| super::portable_relocation::seal(parent, &carried, &self.token))
            .transpose()?;
        Ok(json!({
            "kind": "carried",
            "records": captured.native.predecessor.source.records,
            "alternateOmissionRefusals": 1,
            "carriedAlternateArchives": pins.len(),
            "publishedDiscussionSources": required_sources.len(),
            "publishedDiscussionSourceRefusals": published_source_refusals,
            "discussionBackup": bundle.is_some(),
            "incompleteDiscussionBackupRefusals": if bundle.is_some() {2} else {0},
            "retainedBackup": retained_backup.as_ref().map(|identity| json!({
                "selectedJournals": identity.retained.selected_journals.len(),
                "alternateJournals": identity.retained.alternate_journals.len(),
                "standaloneUploads": identity.retained.standalone_uploads.len(),
            })),
            "retainedBackupNativePredecessors": retained_backup.as_ref().map(|identity| identity.native_predecessors.len()),
            "portableSeal": portable_seal,
        }))
    }
}

pub(super) fn serve(parent: &Path, handle: ServerBackupHandle) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_owned();
    tokio::task::spawn_blocking(move || {
        let command: Carry = serde_json::from_slice(&input()?)?;
        let result = command.commit(&parent, &handle)?;
        {
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "{result}")?;
            stdout.flush()?;
        }
        let _ = std::io::stdin().lock().read(&mut [0; 1]);
        Ok(())
    })
}
