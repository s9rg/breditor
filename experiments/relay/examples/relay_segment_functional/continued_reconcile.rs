//! Check detached recovery inputs with the original protected SDK registration.
use super::{Result, configured_auth, read, storage};
use breditor_collab_relay::{
    Error, MissingRecoveryRegistration, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials,
    server::{
        ContentAddressedServerAssets, ContinuedRasterActivationApproval,
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
}

pub(super) fn read_protected(parent: &Path) -> Result<Protected> {
    Ok(serde_json::from_str(&read(&parent.join("protected.json"), 4096)?)?)
}

impl Protected {
    pub fn credentials(&self) -> RecoveryRegistrationCredentials {
        RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: self.writer.clone(),
                credential: self.document_credential.clone(),
            }],
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
    assert_eq!(
        pending.missing_registrations,
        [MissingRecoveryRegistration::Document {
            principal: "owner".into(),
            writer: protected.writer.clone(),
        }]
    );

    let credentials = protected.credentials();
    let complete =
        target.verify_recovery_inputs(&authentication, "owner", token, &credentials, &provider)?;
    if approve {
        let approval = ContinuedRasterActivationApproval::select(&complete)?;
        storage::write_new(&parent.join("approval.json"), &serde_json::to_vec(&approval)?)?;
        File::open(parent)?.sync_all()?;
    }
    assert_eq!(complete.target, *target.identity());
    assert!(complete.missing_registrations.is_empty());
    assert!(complete.missing_upload_writers.is_empty());
    assert!(complete.client_journals.missing_document_writers.is_empty());
    assert!(complete.client_journals.missing_review_actors.is_empty());
    assert_eq!(complete.client_journals.journals.len(), 1);
    let head = &complete.client_journals.journals[0];
    assert!(head.local_through.parse::<u64>()? > head.accepted_through.parse::<u64>()?);
    Ok(json!({
        "inputsComplete": complete.inputs_complete(),
        "matchedAssets": complete.assets.into_iter().map(|entry| entry.asset).collect::<Vec<_>>(),
        "missingAssets": complete.missing_assets,
        "stagedRasters": complete.staged_rasters,
    }))
}
