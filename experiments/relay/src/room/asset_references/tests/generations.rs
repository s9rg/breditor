//! Real retained history and packet ancestry across files, independent from visible AST/catalogs.
use super::*;
use crate::room::SegmentCheckpointEncoding::{self, Compactable, IndexedAssetHistory, Original};
use crate::room::log_generations::tests::setup_profile;

fn generation_pairs(
    value: &ServerLogGenerationRetainedAssetReferences,
) -> TestResult<Vec<(String, String)>> {
    let ServerAssetReferenceOutcome::Ready { references } = &value.outcome else {
        return Err("whole native complete source expected".into());
    };
    Ok(references.iter().map(|r| (r.asset.clone(), r.generation.clone())).collect())
}

#[test]
fn all_ten_generation_readers_keep_deleted_intermediate_and_version_images_at_one_archive_cut()
-> TestResult {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (files, mut room, profile) = setup_profile(language, standard, atomic)?;
            room.enable_document_versions("owner")?;
            room.enable_document_history_generations("owner", "root".into(), "one".into())?;
            let registered = room.register("owner")?;
            let mut client = profile.join_frame(
                "room".into(),
                registered.lease.writer.clone(),
                &room.catchup("owner")?,
            )?;
            let version = client.capture_document_version_guarded(
                &client.observe()?,
                "Original image",
                ReviewPrincipalId::try_new("owner")?,
                "1",
            )?;
            assert!(matches!(
                room.publish_document_version("owner", &version)?,
                DocumentVersionAdmission::Durable(_)
            ));
            room.rotate_log_generation("owner", "two")?;
            client.apply(vec![
                image("intermediate", "g2"),
                image("last", "g3"),
                Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
            ])?;
            flush(&mut room, &client, &registered.lease, atomic)?;
            room.seal_document_history_generation("owner", "two".into())?;
            room.rotate_log_generation("owner", "three")?;
            assert!(!client.document_json().contains("breditor/image"));
            let before = room.export_log_generation_backup("owner")?.to_bytes();
            let inventory = room.log_generation_participant_inventory("owner")?;
            let references = room.log_generation_retained_asset_references("owner")?;
            assert_eq!(references.source, inventory.identity().source);
            assert_eq!(
                generation_pairs(&references)?,
                vec![
                    ("asset".into(), "generation".into()),
                    ("intermediate".into(), "g2".into()),
                    ("last".into(), "g3".into())
                ]
            );
            assert_eq!(references.sources.len(), 1);
            assert!(matches!(references.sources[0].packet, PacketAssetIdentity::Version { .. }));
            assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), before);
            assert!(room.retained_asset_references("owner").is_err());
            drop(room);
            let (mut room, _) = Room::open_log_generations(&files.room())?;
            assert_eq!(room.log_generation_retained_asset_references("owner")?, references);
        }
    }
    Ok(())
}

#[test]
fn rejected_and_abandoned_packets_in_retained_files_keep_images_that_never_became_accepted()
-> TestResult {
    retained_packet_ancestry(Original, Original)
}

#[test]
fn indexed_packet_history_matches_live_and_legacy_reads_across_mixed_relay_segments() -> TestResult
{
    retained_packet_ancestry(IndexedAssetHistory, Original)?;
    retained_packet_ancestry(Original, IndexedAssetHistory)
}

#[test]
fn compacted_checkpoint_keeps_abandoned_asset_references_without_the_original_archive() -> TestResult
{
    retained_packet_ancestry(Compactable, Original)
}

fn retained_packet_ancestry(
    root: SegmentCheckpointEncoding,
    suffix: SegmentCheckpointEncoding,
) -> TestResult {
    let (files, mut room, profile) = setup_profile(3, true, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let registered = room.register("owner")?;
    let client =
        profile.join_frame("room".into(), registered.lease.writer, &room.catchup("owner")?)?;
    let previous = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Root",
        ReviewPrincipalId::try_new("owner")?,
        "1",
        draft(vec![image("root-only", "root-generation")]),
    )?;
    let previous_id = publish(&mut room, &previous)?;
    room.rotate_log_generation("owner", "two")?;
    let revision = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &previous,
        "Orphan",
        "2",
        draft(vec![image("orphan-only", "orphan-generation")]),
    )?;
    let child = client.document_suggestion_revision_packet(&previous, &revision)?;
    let child_id = client.read_document_suggestion(&child)?.id;
    room.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
        principal: "owner".into(),
        request: SuggestionRevisionRequest {
            binding: room.document_suggestion_revisions_descriptor("owner")?.binding,
            previous_suggestion_id: previous_id.clone(),
            revision_packet: revision,
        },
    })?;
    room.rotate_log_generation("owner", "three")?;
    room.log.append(Event::Grant {
        actor: "owner".into(),
        principal: "reader".into(),
        role: Some(Role::Reader),
    })?;
    room.rotate_log_generation("owner", "four")?;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert!(room.document_suggestion_packet("owner", &child_id)?.is_none());
    assert!(room.document_suggestion_revisions_page("owner", None)?.revisions.is_empty());
    room.decide_document_suggestion(
        "owner",
        &SuggestionDecisionRequest {
            binding: room.document_suggestions_descriptor("owner")?.binding,
            suggestion_id: previous_id,
            decision: SuggestionDecision::Reject,
        },
    )?;
    let result = room.log_generation_retained_asset_references("owner")?;
    let refs = generation_pairs(&result)?;
    assert!(refs.contains(&("root-only".into(), "root-generation".into())));
    assert!(refs.contains(&("orphan-only".into(), "orphan-generation".into())));
    assert_eq!(result.sources.len(), 2);
    assert!(!room.replica.document_json().contains("orphan-only"));
    let backup = room.export_log_generation_backup("owner")?;
    let identity = backup.info().identity;
    drop(room);
    let mut restored = crate::ServerLogGenerationRecovery::begin(
        &files.recovery(),
        &backup,
        &identity,
        crate::RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    assert_eq!(restored.room_mut().log_generation_retained_asset_references("owner")?, result);

    let source = files.room();
    let parent = source.parent().ok_or("fixture parent")?;
    let destination = parent.join("writable-successor");
    let archive = parent.join("successor-base.archive");
    let checkpoint = parent.join("successor-base.checkpoint");
    drop(restored);
    let (mut old, _) = Room::open_log_generations(&source)?;
    let identity = old.write_relay_segment_base_with_encoding(
        "owner",
        &mut fs::File::create_new(&archive)?,
        &mut fs::File::create_new(&checkpoint)?,
        root,
    )?;
    let raw = crate::RelaySegmentBaseFile::open(
        fs::File::open(&archive)?,
        fs::File::open(&checkpoint)?,
        &identity,
    )?;
    assert!(raw.checkpoint_encoding()? == root);
    let base = if root == Compactable {
        let compacted = crate::RelaySegmentBaseFile::open_compacted_checkpoint(
            fs::File::open(&checkpoint)?,
            &identity,
            None,
        )?;
        drop(raw);
        fs::remove_file(&archive)?;
        assert!(!archive.exists());
        compacted
    } else {
        raw
    };
    let base = std::sync::Arc::new(base);
    if root == IndexedAssetHistory {
        use crate::room::materialized_checkpoint::Checkpoint;
        use sha2::{Digest, Sha256};
        let exact = fs::read(&checkpoint)?;
        let decoded: Checkpoint = serde_json::from_slice(&exact)?;
        assert_eq!(serde_json::to_vec(&decoded)?, exact);
        let mut changed = serde_json::to_value(decoded)?;
        let records =
            changed["assetPacketHistory"]["records"].as_array_mut().ok_or("packet history")?;
        assert_eq!(records.len(), 2);
        let removed = records.pop().ok_or("abandoned packet")?;
        assert_eq!(removed["event"]["kind"], "revisionPrepare");
        let changed: Checkpoint = serde_json::from_value(changed)?;
        let bytes = serde_json::to_vec(&changed)?;
        let replaced = parent.join("incomplete.checkpoint");
        fs::write(&replaced, &bytes)?;
        let mut replacement = identity.clone();
        replacement.checkpoint.sha256 = Sha256::digest(&bytes).into();
        let incomplete = std::sync::Arc::new(crate::RelaySegmentBaseFile::open(
            fs::File::open(&archive)?,
            fs::File::open(replaced)?,
            &replacement,
        )?);
        assert!(matches!(
            old.continue_into_relay_segment("owner", &destination, incomplete, "fresh"),
            Err(Error::Contract("relay segment checkpoint differs from live room"))
        ));
        assert!(!destination.exists());
    }
    let mut successor =
        old.continue_into_relay_segment("owner", &destination, base.clone(), "fresh")?;
    successor.grant("owner", "suffix-reader", Some(Role::Reader))?;
    let references = successor.relay_segment_retained_asset_references("owner")?;
    assert_eq!(references.sources, result.sources);
    assert_eq!(references.outcome, result.outcome);
    drop(successor);
    drop(old);
    let (mut reopened, _) =
        Room::open_relay_segment_successor(&source, &destination, base.clone())?;
    assert_eq!(reopened.relay_segment_retained_asset_references("owner")?, references);
    let extra = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "In successor",
        ReviewPrincipalId::try_new("owner")?,
        "3",
        draft(vec![image("middle-only", "middle-generation")]),
    )?;
    let extra_id = publish(&mut reopened, &extra)?;
    let references = reopened.relay_segment_retained_asset_references("owner")?;
    assert_eq!(references.sources.len(), 3);
    assert_eq!(&references.sources[..2], &result.sources);
    let archive = parent.join("linked.archive");
    let checkpoint = parent.join("linked.checkpoint");
    let identity = reopened.write_relay_segment_base_with_encoding(
        "owner",
        &mut fs::File::create_new(&archive)?,
        &mut fs::File::create_new(&checkpoint)?,
        suffix,
    )?;
    let linked = std::sync::Arc::new(crate::RelaySegmentBaseFile::open_linked(
        fs::File::open(archive)?,
        fs::File::open(checkpoint)?,
        &identity,
        base,
    )?);
    assert_eq!(linked.checkpoint_encoding()? == IndexedAssetHistory, suffix == IndexedAssetHistory);
    let last = parent.join("final");
    let successor =
        reopened.continue_into_relay_segment("owner", &last, linked.clone(), "final-first")?;
    drop(successor);
    drop(reopened);
    let (mut room, _) = Room::open_relay_segment_chain(&[&source, &destination, &last], linked)?;
    let recovered = room.relay_segment_retained_asset_references("owner")?;
    assert_eq!(recovered.sources, references.sources);
    assert_eq!(recovered.outcome, references.outcome);
    assert_eq!(
        room.document_suggestion_packet("owner", &extra_id)?.as_deref(),
        Some(extra.as_str())
    );
    assert!(room.document_suggestion_packet("owner", &child_id)?.is_none());
    Ok(())
}

#[test]
fn a_committed_revision_spanning_physical_files_keeps_its_full_packet_ancestry_and_global_sources()
-> TestResult {
    let (files, mut room, profile) = setup_profile(3, true, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let registered = room.register("owner")?;
    let client =
        profile.join_frame("room".into(), registered.lease.writer, &room.catchup("owner")?)?;
    let previous = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Root",
        ReviewPrincipalId::try_new("owner")?,
        "1",
        draft(vec![image("first-only", "first-generation")]),
    )?;
    let previous_id = publish(&mut room, &previous)?;
    room.rotate_log_generation("owner", "two")?;
    let revision = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &previous,
        "Committed",
        "2",
        draft(vec![image("child-only", "child-generation")]),
    )?;
    let child = client.document_suggestion_revision_packet(&previous, &revision)?;
    let child_id = client.read_document_suggestion(&child)?.id;
    let revision_id = client.read_document_suggestion_revision(&previous, &revision)?.id;
    let prepared_at = room.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
        principal: "owner".into(),
        request: SuggestionRevisionRequest {
            binding: room.document_suggestion_revisions_descriptor("owner")?.binding,
            previous_suggestion_id: previous_id,
            revision_packet: revision,
        },
    })?;
    room.rotate_log_generation("owner", "three")?;
    room.log.append(Event::CommitDocumentSuggestionRevisionV1 {
        prepared_at: prepared_at.to_string(),
        revision_id,
    })?;
    room.rotate_log_generation("owner", "four")?;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert!(room.document_suggestion_packet("owner", &child_id)?.is_some());
    assert_eq!(room.document_suggestion_revisions_page("owner", None)?.revisions.len(), 1);
    let original = room.log_generation_retained_asset_references("owner")?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    assert!(room.pack_sealed_wal("owner", "two")?.packed);
    room.archive_sealed_wal("owner", &checkpoint, "two")?;
    assert_eq!(room.log_generation_retained_asset_references("owner")?, original);
    // An unrelated unpublished stage is included in the archive pin, never in packet history.
    let stage = files.room().join(format!(".stage-{}", crate::credentials::issue()?));
    let mut options = fs::OpenOptions::new();
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let mut file = options.write(true).create_new(true).mode(0o600).open(&stage)?;
    file.write_all(b"unpublished")?;
    file.sync_all()?;
    assert!(matches!(
        room.visit_generation_backup_records("owner", |_, _| Err(Error::Contract(
            "test visitor refusal"
        ))),
        Err(Error::Contract("test visitor refusal"))
    ));
    // The visitor error must leave the live append cursor at the actual cut.
    room.grant("owner", "after-file-visitor", Some(Role::Reader))?;
    let references = room.log_generation_retained_asset_references("owner")?;
    assert_eq!(references.sources.len(), 2);
    assert_eq!(references.sources[1].sequence, prepared_at.to_string());
    assert!(
        generation_pairs(&references)?.contains(&("child-only".into(), "child-generation".into()))
    );
    assert!(
        generation_pairs(&references)?.contains(&("first-only".into(), "first-generation".into()))
    );
    assert_eq!(references.sources, original.sources);
    assert_eq!(references.outcome, original.outcome);
    assert_ne!(references.source, original.source);
    assert_eq!(references.source, room.export_log_generation_backup("owner")?.info().identity);
    assert_eq!(fs::read(&stage)?, b"unpublished");
    drop(room);
    let (mut reopened, retry) = Room::open_log_generations(&files.room())?;
    assert_eq!(retry.truncated_bytes, 0);
    assert_eq!(reopened.log_generation_retained_asset_references("owner")?, references);
    let source = files.room();
    let parent = source.parent().ok_or("fixture parent")?;
    let archive = parent.join("committed.archive");
    let checkpoint = parent.join("committed.checkpoint");
    let identity = reopened.write_relay_segment_base_with_indexed_asset_history(
        "owner",
        &mut fs::File::create_new(&archive)?,
        &mut fs::File::create_new(&checkpoint)?,
    )?;
    let base = std::sync::Arc::new(crate::RelaySegmentBaseFile::open(
        fs::File::open(archive)?,
        fs::File::open(checkpoint)?,
        &identity,
    )?);
    let destination = parent.join("committed-successor");
    let continued =
        reopened.continue_into_relay_segment("owner", &destination, base.clone(), "fresh")?;
    drop(continued);
    drop(reopened);
    let (mut continued, _) = Room::open_relay_segment_successor(&source, &destination, base)?;
    let indexed = continued.relay_segment_retained_asset_references("owner")?;
    assert_eq!(indexed.sources, references.sources);
    assert_eq!(indexed.outcome, references.outcome);
    assert!(continued.document_suggestion_packet("owner", &child_id)?.is_some());
    Ok(())
}

#[test]
fn explicit_generation_readers_refuse_original_storage_without_poisoning_it_or_ignoring_unknown_work()
-> TestResult {
    let directory = Directory::new()?;
    let (_, mut original) = source(&directory, 3, true, true)?;
    let before = original.retained_asset_references("owner")?;
    assert!(original.log_generation_retained_asset_references("owner").is_err());
    assert!(original.log_generation_participant_inventory("owner").is_err());
    assert_eq!(original.retained_asset_references("owner")?, before);
    let (files, mut room, _) = setup_profile(3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    assert!(matches!(
        room.log_generation_retained_asset_references("reader"),
        Err(Error::Permission)
    ));
    let unknown = files.room().join("unrelated-work");
    fs::write(&unknown, b"preserve unrelated work")?;
    assert!(room.log_generation_retained_asset_references("owner").is_err());
    assert_eq!(fs::read(unknown)?, b"preserve unrelated work");
    Ok(())
}
