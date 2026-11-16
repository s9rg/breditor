//! Check detached recovery inputs with the original protected SDK registration.
use super::{Result, configured_auth, read, storage};
use breditor_collab_relay::{
    Error, MissingRecoveryRegistration, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials,
    server::{
        ContentAddressedServerAssets, ContinuedRasterActivationApproval, ContinuedRasterSeal,
        RecoveredContinuedRasterRoom,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs::File, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Protected {
    pub token: String,
    writer: String,
    document_credential: String,
    #[serde(default)]
    additional: Vec<ProtectedWriter>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedWriter {
    writer: String,
    document_credential: String,
}

pub(super) fn read_protected(parent: &Path) -> Result<Protected> {
    Ok(serde_json::from_str(&read(&parent.join("protected.json"), 32 * 1024)?)?)
}

impl Protected {
    pub fn credentials(&self) -> RecoveryRegistrationCredentials {
        RecoveryRegistrationCredentials {
            documents: std::iter::once((&self.writer, &self.document_credential))
                .chain(self.additional.iter().map(|row| (&row.writer, &row.document_credential)))
                .map(|(writer, credential)| RecoveryDocumentCredential {
                    principal: "owner".into(),
                    writer: writer.clone(),
                    credential: credential.clone(),
                })
                .collect(),
            ..RecoveryRegistrationCredentials::default()
        }
    }
}

pub(super) fn verify(
    parent: &Path,
    target: &mut RecoveredContinuedRasterRoom,
    approve: bool,
) -> Result<Value> {
    let protected = read_protected(parent)?;
    let token = &protected.token;
    let authentication = configured_auth(parent)?;
    let provider = ContentAddressedServerAssets;
    let empty = RecoveryRegistrationCredentials::default();
    assert!(matches!(
        target.verify_recovery_inputs(
            &authentication,
            "owner",
            "wrong-account-token",
            &empty,
            &provider
        ),
        Err(Error::Permission)
    ));
    let pending =
        target.verify_recovery_inputs(&authentication, "owner", token, &empty, &provider)?;
    assert!(!pending.inputs_complete());
    let credentials = protected.credentials();
    assert_eq!(pending.missing_registrations.len(), credentials.documents.len());
    for row in &credentials.documents {
        assert!(pending.missing_registrations.contains(&MissingRecoveryRegistration::Document {
            principal: row.principal.clone(),
            writer: row.writer.clone(),
        }));
    }
    let complete =
        target.verify_recovery_inputs(&authentication, "owner", token, &credentials, &provider)?;
    if approve {
        let source_seal = parent.join("seal.json");
        let approval = if source_seal.is_file() {
            let seal = serde_json::from_str(&read(&source_seal, 32 * 1024)?)?;
            ContinuedRasterActivationApproval::select_sealed(&complete, &seal)?
        } else {
            let seal = ContinuedRasterSeal::select(&complete)?;
            storage::write_new(&source_seal, &serde_json::to_vec(&seal)?)?;
            ContinuedRasterActivationApproval::select(&complete)?
        };
        storage::write_new(&parent.join("approval.json"), &serde_json::to_vec(&approval)?)?;
        File::open(parent)?.sync_all()?;
    }
    assert_eq!(complete.target, *target.identity());
    assert!(complete.missing_registrations.is_empty());
    assert!(complete.missing_upload_writers.is_empty());
    assert!(complete.client_journals.missing_document_writers.is_empty());
    assert!(complete.client_journals.missing_review_actors.is_empty());
    assert_eq!(complete.client_journals.journals.len(), credentials.documents.len());
    let head = complete.client_journals.journals.first().ok_or("missing primary journal")?;
    assert!(head.local_through.parse::<u64>()? > head.accepted_through.parse::<u64>()?);
    let mut response = json!({
        "inputsComplete": complete.inputs_complete(),
        "matchedAssets": complete.assets.into_iter().map(|entry| entry.asset).collect::<Vec<_>>(),
        "missingAssets": complete.missing_assets,
        "stagedRasters": complete.staged_rasters,
    });
    if complete.rolled_raster_generation {
        response["rolledRasterGeneration"] = json!(true);
    }
    Ok(response)
}
