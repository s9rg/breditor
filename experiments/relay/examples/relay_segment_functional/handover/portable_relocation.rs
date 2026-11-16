//! Process-level fixture for sealing on one relay and activating a moved bundle on another.
use super::{POLICY, Result, deployment, input, maintenance, read, restart_floor, storage};
use breditor_collab_relay::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    server::{
        Authentication, ContentAddressedServerAssets, LogGenerationHandoverStatus,
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage, RelaySegmentPortableSeal,
        RelaySegmentRetainedBackup, RelaySegmentRetiredHistorySelection, RoomDeploymentSelection,
        SealedRelaySegmentActivation, ServerBackupHandle, ServerRecoveryAssetProvider,
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
const RETIRED: &str = "portable-relocation-retired-selection.json";
const APPROVAL: &str = "portable-relocation-approval.json";

pub(super) fn seal(
    parent: &Path,
    handle: &ServerBackupHandle,
    token: &str,
) -> Result<serde_json::Value> {
    let path = parent.join("portable-relocation-source");
    let original = parent.join("portable-relocation-split");
    let converted = parent.join("portable-relocation-converted");
    let captured = handle.capture_portable_relay_segment("owner", token, &original)?;
    RelaySegmentRetainedBackup::copy_portable_with_compressed_checkpoints(
        &original, &converted, &captured,
    )?;
    let direct = parent.join("portable-relocation-direct");
    let direct_identity = handle
        .capture_portable_relay_segment_with_compressed_checkpoints("owner", token, &direct)?;
    assert_eq!(direct_identity, captured);
    assert_eq!(
        fs::read(direct.join("client-inputs.bin"))?,
        fs::read(converted.join("client-inputs.bin"))?
    );
    assert_same_lineage(&direct, &converted)?;
    fs::rename(original, parent.join("portable-relocation-retired-split"))?;
    let compacted_copy = parent.join("portable-relocation-compacted-copy");
    RelaySegmentRetainedBackup::copy_portable_with_compacted_history(
        &converted,
        &compacted_copy,
        &captured,
    )?;
    let compacted =
        handle.capture_portable_relay_segment_with_compacted_history("owner", token, &path)?;
    assert_eq!(compacted.native_predecessors, captured.native_predecessors);
    assert_eq!(
        compacted.retained.backup.native.predecessor,
        captured.retained.backup.native.predecessor
    );
    assert_eq!(compacted.retained.backup.assets, captured.retained.backup.assets);
    assert_ne!(
        compacted.retained.backup.native.checkpoint.sha256,
        captured.retained.backup.native.checkpoint.sha256
    );
    assert_same_lineage(&path, &compacted_copy)?;
    let retired_path = parent.join("portable-relocation-retired");
    let retired = RelaySegmentRetainedBackup::copy_portable_with_retired_history(
        &path,
        &retired_path,
        &compacted,
    )?;
    assert_eq!(retired.backup(), &compacted);
    assert!(RelaySegmentRetainedBackup::open_portable(&retired_path, &compacted).is_err());
    let proof_path = parent.join("portable-relocation-proofs");
    let proofs = RelaySegmentRetainedBackup::copy_portable_with_ancestry_proofs(
        &retired_path,
        &proof_path,
        &retired,
    )?;
    assert_eq!(proofs.backup(), &compacted);
    let extended_path = parent.join("portable-relocation-extended");
    let extended = handle.capture_portable_relay_segment_with_extended_terminal(
        "owner",
        token,
        &extended_path,
    )?;
    assert_eq!(extended.backup().native_predecessors, proofs.backup().native_predecessors);
    assert_eq!(
        extended.backup().retained.backup.native.predecessor,
        proofs.backup().retained.backup.native.predecessor
    );
    assert_same_lineage(&extended_path, &proof_path)?;
    let detached_path = parent.join("portable-relocation-extended-copy");
    let detached = RelaySegmentRetainedBackup::copy_portable_with_ancestry_proofs(
        &extended_path,
        &detached_path,
        &extended,
    )?;
    assert_eq!(detached, extended);
    let intent = RelaySegmentPortableSeal::select(extended.backup().clone())?;
    storage::write_new(&parent.join(SEAL), &serde_json::to_vec(&intent)?)?;
    storage::write_new(&parent.join(RETIRED), &serde_json::to_vec(&detached)?)?;
    File::open(parent)?.sync_all()?;
    let selected = handle.seal_portable_relay_segment_with_retired_history(
        "owner",
        token,
        &detached_path,
        &intent,
        &detached,
    )?;
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

fn assert_same_lineage(left: &Path, right: &Path) -> Result<()> {
    let left_bytes = fs::read(left.join("native-lineage/packed.bin"))?;
    let right_bytes = fs::read(right.join("native-lineage/packed.bin"))?;
    assert!(
        left_bytes == right_bytes,
        "lineage differs between {left:?} ({} bytes) and {right:?} ({} bytes)",
        left_bytes.len(),
        right_bytes.len()
    );
    Ok(())
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
) -> Result<(axum::Router, Option<tokio::task::JoinHandle<Result>>)> {
    let command: Command = serde_json::from_slice(&input()?)?;
    let seal: RelaySegmentPortableSeal =
        serde_json::from_str(&read(&parent.join(SEAL), 128 * 1024)?)?;
    let retired: RelaySegmentRetiredHistorySelection =
        serde_json::from_str(&read(&parent.join(RETIRED), 128 * 1024)?)?;
    assert_eq!(retired.backup(), seal.backup());
    let moved = parent.join("portable-relocation-arrived");
    let bundle = RelaySegmentRetainedBackup::open_portable_with_retired_history(&moved, &retired)?;
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
            let (router, handle, active) = target.activate_sealed_portable_relay(
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
            Ok((router, Some(maintenance::serve(parent, handle))))
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
            let (router, handle, resumed) = target.resume_handover(
                authentication,
                "owner",
                &token,
                &authority,
                &approval,
                &selected,
            )?;
            assert_ne!(selected, resumed);
            restart_floor::remember(parent, APPROVAL, &resumed)?;
            Ok((router, Some(maintenance::serve(parent, handle))))
        }
    }
}
