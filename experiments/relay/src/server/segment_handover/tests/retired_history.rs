//! Independently pinned retired archives and comparison against the actual serving lineage.
use super::{Source, TestResult, auth};
use crate::{
    Error,
    server::{RelaySegmentPortableSeal, RelaySegmentRetainedBackup},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;

#[tokio::test]
async fn retired_pack_requires_its_selection_and_seal_checks_the_original_archive() -> TestResult {
    let source = Source::open()?;
    let base = source.capture("retirement-base")?;
    let (target, approval) = source.approve(&base, &source.parent.join("retirement-live"))?;
    let (_router, live, live_epoch) = source.handle.commit_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
    )?;
    let full = source.parent.join("retirement-original");
    let retired = source.parent.join("retirement-copy");
    let identity = live.capture_portable_relay_segment("owner", &source.token, &full)?;
    assert_eq!(identity.native_predecessors.len(), 1);
    let selected =
        RelaySegmentRetainedBackup::copy_portable_with_retired_history(&full, &retired, &identity)?;
    assert_eq!(selected.backup(), &identity);
    assert!(RelaySegmentRetainedBackup::open_portable(&retired, &identity).is_err());
    RelaySegmentRetainedBackup::open_portable_with_retired_history(&retired, &selected)?;

    let file = retired.join("native-lineage/packed.bin");
    let bytes = fs::read(&file)?;
    assert_eq!(&bytes[..8], b"BRLINE4\n");
    let stored = usize::try_from(u64::from_be_bytes(bytes[28..36].try_into()?))?;
    let offset = 36 + stored;
    let mut proof: Value = serde_json::from_slice(&bytes[offset + 8..])?;
    let digest_first = &mut proof["closure"]["files"][0]["sha256"][0];
    let original_byte = digest_first.as_u64().ok_or("section digest")?;
    *digest_first = json!(original_byte ^ 1);
    let proof = serde_json::to_vec(&proof)?;
    let mut changed = bytes[..offset].to_vec();
    changed.extend_from_slice(&(proof.len() as u64).to_be_bytes());
    changed.extend_from_slice(&proof);
    fs::write(&file, &changed)?;
    assert!(matches!(
        RelaySegmentRetainedBackup::open_portable_with_retired_history(&retired, &selected),
        Err(Error::Contract("portable retired lineage digest differs"))
    ));

    let mut different_selection = selected.clone();
    different_selection.lineage_sha256 = Some(Sha256::digest(&changed).into());
    // A detached selection names its physical input. The live seal independently
    // compares the proof with the predecessor the relay actually held.
    RelaySegmentRetainedBackup::open_portable_with_retired_history(&retired, &different_selection)?;
    let intent = RelaySegmentPortableSeal::select(identity)?;
    assert!(matches!(
        live.seal_portable_relay_segment_with_retired_history(
            "owner",
            &source.token,
            &retired,
            &intent,
            &different_selection,
        ),
        Err(Error::Contract("portable retirement proof differs from live history"))
    ));
    assert_eq!(source.authority.current_selection()?, live_epoch);
    fs::write(&file, bytes)?;
    let sealed = live.seal_portable_relay_segment_with_retired_history(
        "owner",
        &source.token,
        &retired,
        &intent,
        &selected,
    )?;
    assert_eq!(sealed, intent.planned_selection()?);
    Ok(())
}
