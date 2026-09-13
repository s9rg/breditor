use super::*;
use crate::codec::{LocalLogCheckpointJsonCodecV2, LocalLogStorageRootJsonCodecV2};

#[test]
fn outer_and_nested_generations_are_never_negotiated() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let root = fixture.encoded_root()?;
    let codec = fixture.root_codec();
    assert!(
        LocalLogStorageRootJsonCodecV2::new(fixture.context.clone(), fixture.root_binding.clone())
            .decode_root(&root)
            .is_err()
    );
    let (selected, _, rotation) = fixture.first_rotation()?;
    let rotation_codec = fixture.rotation_codec()?;
    for version in [1, 2, 4] {
        let replacement = format!("\"formatVersion\":{version}");
        let wrong = root.replacen("\"formatVersion\":3", &replacement, 1);
        assert!(
            matches!(codec.decode_root(&wrong), Err(LocalLogStorageRootV3CodecError::UnsupportedFormatVersion { found, supported: 3 }) if found == version)
        );
        let wrong = rotation.replacen("\"formatVersion\":3", &replacement, 1);
        assert!(
            matches!(rotation_codec.decode_rotation_from_selected(&wrong, &selected), Err(LocalLogStorageGenerationV3CodecError::UnsupportedFormatVersion { found, supported: 3 }) if found == version)
        );
    }
    // A genuine canonical old checkpoint must not be accepted inside a V3 root.
    let anchor = fixture.root_outcome.anchor();
    let old = LocalLogCheckpointJsonCodecV2::new(
        fixture.context.clone(),
        LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )?,
    )
    .encode(anchor)?;
    let current = codec.decode_root(&root)?;
    let wrapped = root
        .replace(&serde_json::to_string(current.checkpoint_json())?, &serde_json::to_string(&old)?);
    assert_ne!(wrapped, root);
    assert!(matches!(
        codec.decode_root(&wrapped),
        Err(LocalLogStorageRootV3CodecError::InvalidCheckpoint(_))
    ));
    Ok(())
}

#[test]
fn canonical_shape_and_frame_policies_are_strict() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let root = fixture.encoded_root()?;
    for malformed in [
        format!(" {root}"),
        root.replacen('{', "{\"extra\":0,", 1),
        root.replacen('{', "{\"formatVersion\":3,", 1),
    ] {
        assert!(fixture.root_codec().decode_root(&malformed).is_err());
    }
    let (selected, _, json) = fixture.first_rotation()?;
    for field in ["sealedFrame", "successorFrame"] {
        for version in [1, 2, 4] {
            let wrong = json.replace(
                &format!("\"{field}\":{{\"formatVersion\":3"),
                &format!("\"{field}\":{{\"formatVersion\":{version}"),
            );
            assert_ne!(wrong, json);
            assert!(matches!(
                fixture.rotation_codec()?.decode_rotation_from_selected(&wrong, &selected),
                Err(LocalLogStorageGenerationV3CodecError::InvalidRecord(_))
            ));
        }
    }
    assert!(
        fixture
            .rotation_codec()?
            .decode_rotation_from_selected(&format!("{json}\n"), &selected)
            .is_err()
    );
    Ok(())
}

#[test]
fn rotation_limits_and_known_identity_reuse_leave_inputs_unchanged() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let (selected, manifest, json) = fixture.first_rotation()?;
    let limits = LocalLogStorageGenerationLimits::default()
        .with_max_input_bytes(json.len())
        .with_max_checkpoint_json_bytes(manifest.checkpoint_json_bytes())
        .with_max_output_bytes(json.len());
    let codec = fixture.rotation_codec()?.with_limits(limits);
    assert_eq!(codec.encode_rotation_from_selected(&manifest, &selected)?, json);
    assert_eq!(codec.decode_rotation_from_selected(&json, &selected)?, manifest);
    let short = fixture.rotation_codec()?.with_limits(limits.with_max_input_bytes(json.len() - 1));
    assert!(matches!(
        short.decode_rotation_from_selected(&json, &selected),
        Err(LocalLogStorageGenerationV3CodecError::InputTooLarge { .. })
    ));
    let short = fixture
        .rotation_codec()?
        .with_limits(limits.with_max_checkpoint_json_bytes(manifest.checkpoint_json_bytes() - 1));
    assert!(matches!(
        short.decode_rotation_from_selected(&json, &selected),
        Err(LocalLogStorageGenerationV3CodecError::ResourceLimit(_))
    ));
    let short = fixture.rotation_codec()?.with_limits(limits.with_max_output_bytes(json.len() - 1));
    assert!(matches!(
        short.encode_rotation_from_selected(&manifest, &selected),
        Err(LocalLogStorageGenerationV3CodecError::OutputTooLarge { .. })
    ));
    let outcome = fixture.rotation_outcome(&selected)?;
    for (transaction, fence) in
        [(ROOT_TRANSACTION, ROTATION_FENCE), (ROTATION_TRANSACTION, ROOT_FENCE)]
    {
        let inputs = LocalLogStorageGenerationPreparationInputs::new(
            LocalLogStorageTransactionId::try_new(transaction)?,
            LocalLogStorageFenceId::try_new(fence)?,
            LocalLogFrameLimits::default(),
        );
        assert!(matches!(
            codec.prepare_rotation_from_selected(&selected, &outcome, &inputs),
            Err(LocalLogStorageGenerationV3CodecError::InvalidContinuity(_))
        ));
    }
    assert_eq!(codec.encode_rotation_from_selected(&manifest, &selected)?, json);
    assert_eq!(outcome.accepted_prefix_bytes(), 57);
    Ok(())
}

#[test]
fn ordinary_rotation_continues_a_checked_v3_manifest() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let (_, prior, _) = fixture.first_rotation()?;
    let checkpoint_codec = LocalLogCheckpointJsonCodecV3::new(
        fixture.context.clone(),
        LocalLogCheckpointBinding::try_new(
            prior.session_id().clone(),
            prior.sealed_log_id().clone(),
            prior.successor_log_id().clone(),
        )?,
    );
    let anchor = checkpoint_codec.decode(prior.checkpoint_json())?;
    let outcome = anchor
        .begin_successor_tail_v3(
            LocalLogRecoveryLimits::default(),
            prior.successor_frame().limits(),
        )
        .try_into_checkpoint_anchor(LocalLogId::try_new("log:storage-v3-tests:g4")?)?;
    let codec = LocalLogStorageGenerationJsonCodecV3::new(
        fixture.context.clone(),
        LocalLogStorageGenerationBinding::try_new(
            prior.profile_id().clone(),
            prior.profile_version(),
            prior.scope_id().clone(),
            prior.committed_head_id().clone(),
            LocalLogStorageHeadId::try_new("head:storage-v3-tests:h2")?,
        )?,
    );
    let inputs = LocalLogStorageGenerationPreparationInputs::new(
        LocalLogStorageTransactionId::try_new("transaction:storage-v3-tests:second")?,
        LocalLogStorageFenceId::try_new("fence:storage-v3-tests:f2")?,
        LocalLogFrameLimits::default(),
    );
    let next = codec.prepare_rotation(&prior, &outcome, &inputs)?;
    let json = codec.encode_rotation(&next, &prior)?;
    assert_eq!(codec.decode_rotation(&json, &prior)?, next);
    assert_eq!(next.accepted_prefix_bytes(), 0);
    assert_eq!(next.sealed_frame(), prior.successor_frame());
    let reused = LocalLogStorageGenerationPreparationInputs::new(
        inputs.transaction_id().clone(),
        prior.fence_id().clone(),
        inputs.successor_frame_limits(),
    );
    assert!(matches!(
        codec.prepare_rotation(&prior, &outcome, &reused),
        Err(LocalLogStorageGenerationV3CodecError::InvalidContinuity(
            crate::codec::LocalLogStorageGenerationContinuityError::KnownFenceIdReused
        ))
    ));
    let reused_json = json.replace(next.fence_id().as_str(), prior.fence_id().as_str());
    assert_ne!(reused_json, json);
    assert!(matches!(
        codec.decode_rotation(&reused_json, &prior),
        Err(LocalLogStorageGenerationV3CodecError::InvalidContinuity(
            crate::codec::LocalLogStorageGenerationContinuityError::KnownFenceIdReused
        ))
    ));
    Ok(())
}
