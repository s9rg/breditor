//! Check detached recovery inputs with the original protected SDK registration.
use super::{Result, configured_auth, read};
use breditor_collab_relay::{
    Error, MissingRecoveryRegistration, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials,
    server::{ContentAddressedServerAssets, RecoveredContinuedRasterRoom},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Protected {
    token: String,
    writer: String,
    document_credential: String,
}

pub(super) fn verify(parent: &Path, target: &mut RecoveredContinuedRasterRoom) -> Result<Value> {
    let Protected { token, writer, document_credential } =
        serde_json::from_str(&read(&parent.join("protected.json"), 4096)?)?;
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
        target.verify_recovery_inputs(&authentication, "owner", &token, &empty, &provider)?;
    assert!(!pending.inputs_complete());
    assert_eq!(
        pending.missing_registrations,
        [MissingRecoveryRegistration::Document {
            principal: "owner".into(),
            writer: writer.clone(),
        }]
    );

    let credentials = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer,
            credential: document_credential,
        }],
        ..RecoveryRegistrationCredentials::default()
    };
    let complete =
        target.verify_recovery_inputs(&authentication, "owner", &token, &credentials, &provider)?;
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
