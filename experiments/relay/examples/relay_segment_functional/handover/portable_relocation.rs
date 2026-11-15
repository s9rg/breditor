//! Process-level fixture for sealing on one relay and activating a moved bundle on another.
use super::{POLICY, Result, deployment, input, read, restart_floor, storage};
use breditor_collab_relay::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    server::{
        Authentication, ContentAddressedServerAssets, LogGenerationHandoverStatus,
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage, RelaySegmentPortableSeal,
        RelaySegmentRetainedBackup, RoomDeploymentSelection, SealedRelaySegmentActivation,
        ServerBackupHandle, ServerRecoveryAssetProvider,
    },
};
use serde::Deserialize;
use serde_json::json;
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
    sync::Arc,
};

const ROOM: &str = "relocated";
const SEAL: &str = "portable-relocation-seal.json";
const APPROVAL: &str = "portable-relocation-approval.json";

pub(super) fn seal(
    parent: &Path,
    handle: &ServerBackupHandle,
    token: &str,
) -> Result<serde_json::Value> {
    let path = parent.join("portable-relocation-source");
    let original = parent.join("portable-relocation-split");
    let captured = handle.capture_portable_relay_segment("owner", token, &original)?;
    RelaySegmentRetainedBackup::copy_portable_packed(&original, &path, &captured)?;
    fs::rename(original, parent.join("portable-relocation-retired-split"))?;
    let intent = RelaySegmentPortableSeal::select(captured)?;
    storage::write_new(&parent.join(SEAL), &serde_json::to_vec(&intent)?)?;
    File::open(parent)?.sync_all()?;
    let selected = handle.seal_portable_relay_segment("owner", token, &path, &intent)?;
    let authority = deployment(parent)?;
    assert_eq!(selected, intent.planned_selection()?);
    assert_eq!(authority.current_selection()?, selected);
    assert_eq!(intent.status(&authority)?, LogGenerationHandoverStatus::Sealed);
    let stale = parent.join("unexpected-after-seal");
    assert!(matches!(
        handle.capture_portable_relay_segment("owner", token, &stale),
        Err(Error::Lease)
    ));
    assert!(!stale.exists());
    Ok(json!({
        "nativePredecessors": intent.backup().native_predecessors.len(),
        "packedCopyOfSplit": true,
        "sealedSelection": selected,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    principal: String,
    writer: String,
    credential: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Review {
    principal: String,
    actor: String,
    credential: String,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    Activate {
        token: String,
        documents: Vec<Document>,
        reviews: Vec<Review>,
    },
    Resume {
        token: String,
        #[serde(rename = "expectedUnservedSelection")]
        expected_unserved_selection: Option<RoomDeploymentSelection>,
    },
}

pub(crate) fn router(
    parent: &Path,
    authentication: Authentication,
    exit_before_listen: bool,
) -> Result<axum::Router> {
    let command: Command = serde_json::from_slice(&input()?)?;
    let seal: RelaySegmentPortableSeal =
        serde_json::from_str(&read(&parent.join(SEAL), 128 * 1024)?)?;
    let moved = parent.join("portable-relocation-arrived");
    let bundle = RelaySegmentRetainedBackup::open_portable(&moved, seal.backup())?;
    let room_path = parent.join(ROOM);
    let approval_path = parent.join(APPROVAL);
    match command {
        Command::Activate { token, documents, reviews } => {
            let authority = deployment(parent)?;
            let selected = seal.planned_selection()?;
            assert_eq!(authority.current_selection()?, selected);
            assert_eq!(seal.status(&authority)?, LogGenerationHandoverStatus::Sealed);
            let mut target = bundle.restore(&room_path, "relocated-one", POLICY)?;
            let provider: Arc<dyn ServerRecoveryAssetProvider> =
                Arc::new(ContentAddressedServerAssets);
            let missing = target.verify_handover_inputs(
                &authentication,
                "owner",
                &token,
                &RecoveryRegistrationCredentials::default(),
                &provider,
            )?;
            let RelaySegmentHandoverInputCoverage::Pending(missing) = missing else {
                return Err("relocation verified without original protected credentials".into());
            };
            assert_eq!(missing.missing_registrations.len(), documents.len() + reviews.len());
            assert_eq!(authority.current_selection()?, selected);
            let credentials = RecoveryRegistrationCredentials {
                documents: documents
                    .into_iter()
                    .map(|document| RecoveryDocumentCredential {
                        principal: document.principal,
                        writer: document.writer,
                        credential: document.credential,
                    })
                    .collect(),
                reviews: reviews
                    .into_iter()
                    .map(|review| RecoveryReviewCredential {
                        principal: review.principal,
                        actor: review.actor,
                        credential: review.credential,
                    })
                    .collect(),
            };
            let coverage = target.verify_handover_inputs(
                &authentication,
                "owner",
                &token,
                &credentials,
                &provider,
            )?;
            let RelaySegmentHandoverInputCoverage::Verified(inputs) = coverage else {
                return Err("portable relocation lacked verified protected inputs".into());
            };
            let approval =
                RelaySegmentHandoverApproval::select_verified(&target, &inputs, selected)?;
            storage::write_new(&approval_path, &serde_json::to_vec(&approval)?)?;
            File::open(parent)?.sync_all()?;
            restart_floor::remember(parent, APPROVAL, &approval.planned_selection()?)?;
            let (router, _, active) = target.activate_sealed_portable_relay(
                authentication,
                "owner",
                &token,
                &SealedRelaySegmentActivation {
                    authority: &authority,
                    seal: &seal,
                    approval: &approval,
                    inputs: &inputs,
                },
            )?;
            assert_eq!(active, approval.planned_selection()?);
            if exit_before_listen {
                // Skip destructors and exit before main can bind the listener.
                let mut stdout = std::io::stdout().lock();
                writeln!(stdout, "{}", json!({"kind": "activated", "selection": active}))?;
                stdout.flush()?;
                std::process::exit(77);
            }
            Ok(router)
        }
        Command::Resume { token, expected_unserved_selection } => {
            assert!(!exit_before_listen);
            let approval: RelaySegmentHandoverApproval =
                serde_json::from_str(&read(&approval_path, 128 * 1024)?)?;
            assert_eq!(approval.previous_selection(), &seal.planned_selection()?);
            let authority = restart_floor::open(parent, APPROVAL, &approval)?;
            let target = bundle.backup().reopen(&room_path, POLICY)?;
            let selected = authority.current_selection()?;
            if let Some(expected) = expected_unserved_selection {
                assert_eq!(expected, approval.planned_selection()?);
                assert_eq!(selected, expected);
            }
            let (router, _, resumed) = target.resume_handover(
                authentication,
                "owner",
                &token,
                &authority,
                &approval,
                &selected,
            )?;
            assert_ne!(selected, resumed);
            restart_floor::remember(parent, APPROVAL, &resumed)?;
            Ok(router)
        }
    }
}
