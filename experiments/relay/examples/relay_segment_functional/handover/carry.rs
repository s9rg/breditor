//! A second live handover from the first replacement and an independently exported alternate.
use super::{POLICY, Result, configured_auth, deployment, input, storage};
use crate::{captured_base, original_capture};
use breditor_collab_relay::{
    Error, RecoveredRelaySegmentRoom, RecoveryDocumentCredential, RecoveryRegistrationCredentials,
    RecoveryReviewCredential, RelaySegmentClientJournal, RelaySegmentClientJournalPin,
    RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin, RelaySegmentRoomBackupFiles,
    server::{
        ContentAddressedServerAssets, RelaySegmentHandoverApproval,
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
    peer_upload: RelaySegmentClientUploadPin,
    journals: [RelaySegmentClientJournalPin; 2],
    alternate: RelaySegmentClientJournalPin,
}

pub(super) fn backup(parent: &Path) -> Result<RelaySegmentRoomBackupFiles> {
    let (prior, _) = original_capture(parent)?;
    let capture = parent.join("carry-capture");
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
        let (captured, old_epoch) =
            handle.capture_relay_segment(principal, &self.token, &parent.join("carry-capture"))?;
        storage::write_new(&parent.join("carry-restore.json"), &serde_json::to_vec(&captured)?)?;
        let credentials = RecoveryRegistrationCredentials {
            documents: vec![
                RecoveryDocumentCredential {
                    principal: principal.into(),
                    writer: self.writer,
                    credential: self.document_credential,
                },
                RecoveryDocumentCredential {
                    principal: principal.into(),
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
        let alternate = RelaySegmentClientJournal::open(
            File::open(parent.join("exported-alternates/0.participant"))?,
            self.alternate.clone(),
        )?;
        let backup = backup(parent)?;
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
        let mut omitted = backup.restore_with_client_journals(
            &parent.join("omitted-alternate"),
            "omitted-alternate",
            POLICY,
            std::slice::from_ref(&peer_upload),
            &journals,
        )?;
        let inputs = verify(&mut omitted)?;
        let approval =
            RelaySegmentHandoverApproval::select_verified(&omitted, &inputs, old_epoch.clone())?;
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
        assert_eq!(deployment(parent)?.current_selection()?, old_epoch);

        let mut target = backup.restore_with_client_journal_alternatives(
            &parent.join("carried"),
            "carried-one",
            POLICY,
            &[peer_upload],
            &journals,
            &[alternate],
        )?;
        let inputs = verify(&mut target)?;
        let branches = &inputs.report().alternate_branches;
        assert_eq!(branches.len(), 1);
        assert_eq!(branches[0].pin, self.alternate);
        assert!(!branches[0].document.prefix_matches);
        assert!(!branches[0].review.prefix_matches);
        let approval = RelaySegmentHandoverApproval::select_verified(&target, &inputs, old_epoch)?;
        storage::write_new(&parent.join("carry-approval.json"), &serde_json::to_vec(&approval)?)?;
        File::open(parent)?.sync_all()?;
        let (_, _, epoch) = handle.commit_verified_relay_segment_handover(
            principal,
            &self.token,
            target,
            configured_auth(parent)?,
            &approval,
            &inputs,
        )?;
        assert_eq!(epoch, approval.planned_selection()?);
        Ok(json!({
            "kind": "carried",
            "records": captured.native.predecessor.source.records,
            "alternateOmissionRefusals": 1,
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
