//! External consumer: complete historical image references match exact native archive restoration.
use super::{TestResult, send, setup};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command,
        actions::{DeleteBlock, ReplaceImage},
    },
};
use breditor_collab_relay::{
    DocumentVersionAdmission, Role, RoomRecoveryPolicy, ServerAssetReferenceOutcome,
    ServerLogGenerationRecovery,
};

#[test]
fn public_generation_asset_readers_keep_hidden_history_and_match_participants_after_native_restore_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (files, profile, mut room) = setup(version, standard, atomic)?;
            room.enable_document_versions("owner")?;
            let registered = room.register("owner")?;
            let mut client = profile.join_frame(
                "room".into(),
                registered.lease.writer.clone(),
                &room.catchup("owner")?,
            )?;
            let version = client.capture_document_version_guarded(
                &client.observe()?,
                "Original",
                ReviewPrincipalId::try_new("owner")?,
                "1",
            )?;
            assert!(matches!(
                room.publish_document_version("owner", &version)?,
                DocumentVersionAdmission::Durable(_)
            ));
            room.rotate_log_generation("owner", "two")?;
            client.apply(vec![
                Command::ReplaceImage(ReplaceImage {
                    block: "image-block".into(),
                    asset: "historical-only".into(),
                    generation: "retained-generation".into(),
                }),
                Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
            ])?;
            send(&mut room, &client, "owner", &registered.lease, "0", atomic)?;
            room.rotate_log_generation("owner", "three")?;
            let inventory = room.log_generation_participant_inventory("owner")?;
            let value = room.log_generation_retained_asset_references("owner")?;
            assert_eq!(value.source, inventory.identity().source);
            assert!(!client.document_json().contains("breditor/image"));
            let ServerAssetReferenceOutcome::Ready { references } = &value.outcome else {
                return Err("whole complete retained sources".into());
            };
            assert_eq!(references.len(), 2);
            assert!(references.iter().any(|r| r.asset == "asset" && r.generation == "generation"));
            assert!(
                references
                    .iter()
                    .any(|r| r.asset == "historical-only" && r.generation == "retained-generation")
            );
            let backup = room.export_log_generation_backup("owner")?;
            assert_eq!(backup.info().identity, value.source);
            drop(room);
            let mut restored = ServerLogGenerationRecovery::begin(
                &files.0.join("asset-reference-reader"),
                &backup,
                &value.source,
                RoomRecoveryPolicy::HostReacquired,
            )?
            .finish(&backup)?;
            inventory.verify_native(restored.room_mut(), "owner")?;
            assert_eq!(
                restored.room_mut().log_generation_retained_asset_references("owner")?,
                value
            );
        }
    }
    Ok(())
}

#[test]
fn maximum_retained_layout_supports_both_complete_readers_under_the_same_descriptor_budget()
-> TestResult {
    let (_files, _, mut room) = setup(3, true, true)?;
    for index in 0..62 {
        room.grant("owner", "reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("continuation-{index}"))?;
    }
    let archive = room.export_log_generation_backup("owner")?;
    assert_eq!(archive.info().files, 129);
    let participants = room.log_generation_participant_inventory("owner")?;
    let references = room.log_generation_retained_asset_references("owner")?;
    assert_eq!(participants.identity().source, archive.info().identity);
    assert_eq!(references.source, archive.info().identity);
    assert!(matches!(references.outcome, ServerAssetReferenceOutcome::Ready { .. }));
    Ok(())
}
