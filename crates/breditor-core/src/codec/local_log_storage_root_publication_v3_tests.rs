use super::*;
use crate::codec::{LocalLogStorageAttemptPreparationError, LocalLogStorageRootPublicationPlanV3};

#[test]
fn preparation_retains_exact_v3_binding_and_hides_payloads() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let json = fixture.encoded_root()?;
    let root = codec.decode_root(&json)?;
    let plan = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    assert_eq!(plan.candidate_json_bytes(), json.len());
    assert_eq!(plan.schema_binding(), root.schema_binding());
    assert_eq!(
        plan.candidate_receipt().database_incarnation_id(),
        &fixture.database_incarnation_id
    );
    assert_eq!(plan.candidate_receipt().scope_incarnation_id(), &fixture.scope_incarnation_id);
    assert_eq!(plan.candidate_binding().active_generation().frame(), root.active_frame());
    assert_eq!(plan.candidate_receipt().selection_kind(), LocalLogStorageSelectionKind::Root);
    let debug = format!("{plan:?}");
    assert!(!debug.contains("STORAGEV3PAYLOADSENTINEL"));
    assert!(!debug.contains(root.checkpoint_json()));
    assert_eq!(codec.encode_root(&root)?, json);
    let repeated = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    assert!(plan.same_plan_as(&repeated));
    Ok(())
}

#[test]
fn equal_json_is_not_equal_plan_across_database_or_scope_incarnations() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let root = codec.decode_root(&fixture.encoded_root()?)?;
    let different_database = LocalLogStorageDatabaseIncarnationId::try_new("different-database")?;
    let different_scope = LocalLogStorageScopeIncarnationId::try_new("different-scope")?;
    let prepare = |db, scope| codec.prepare_root_publication(db, scope, &root);
    let first = prepare(&fixture.database_incarnation_id, &fixture.scope_incarnation_id)?;
    let database = prepare(&different_database, &fixture.scope_incarnation_id)?;
    let scope = prepare(&fixture.database_incarnation_id, &different_scope)?;
    assert_eq!(first.candidate_json_bytes(), database.candidate_json_bytes());
    assert_eq!(first.candidate_json_bytes(), scope.candidate_json_bytes());
    assert!(!first.same_plan_as(&database));
    assert!(!first.same_plan_as(&scope));
    assert!(!database.same_plan_as(&scope));
    Ok(())
}

#[test]
fn exact_payload_is_part_of_plan_identity() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let codec = fixture.root_codec();
    let original = fixture.encoded_root()?;
    let changed = original.replace("STORAGEV3PAYLOADSENTINEL", "CHANGEDV3PAYLOADSENTINEL");
    assert_ne!(changed, original);
    assert_eq!(changed.len(), original.len());
    let first = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &codec.decode_root(&original)?,
    )?;
    let second = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &codec.decode_root(&changed)?,
    )?;
    assert_eq!(first.candidate_binding(), second.candidate_binding());
    assert_eq!(first.candidate_json_bytes(), second.candidate_json_bytes());
    assert!(!first.same_plan_as(&second));
    Ok(())
}

#[test]
fn closure_rechecks_input_output_policy_and_rejects_crosswired_bindings() -> TestResult {
    let fixture = StorageV3Fixture::new()?;
    let json = fixture.encoded_root()?;
    let root = fixture.root_codec().decode_root(&json)?;
    let exact = LocalLogStorageGenerationLimits::default()
        .with_max_input_bytes(json.len())
        .with_max_output_bytes(json.len());
    let codec = fixture.root_codec().with_limits(exact);
    let plan = codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    let short_input = fixture.root_codec().with_limits(exact.with_max_input_bytes(json.len() - 1));
    assert!(matches!(
        short_input.prepare_root_publication(
            &fixture.database_incarnation_id,
            &fixture.scope_incarnation_id,
            &root
        ),
        Err(LocalLogStorageAttemptPreparationError::InvalidCandidateEnvelope { .. })
    ));
    let short_output =
        fixture.root_codec().with_limits(exact.with_max_output_bytes(json.len() - 1));
    assert!(matches!(
        short_output.prepare_root_publication(
            &fixture.database_incarnation_id,
            &fixture.scope_incarnation_id,
            &root
        ),
        Err(LocalLogStorageAttemptPreparationError::InvalidCandidate { .. })
    ));
    let other = codec.prepare_root_publication(
        &LocalLogStorageDatabaseIncarnationId::try_new("wrong-database")?,
        &fixture.scope_incarnation_id,
        &root,
    )?;
    let normalized = fixture.normalize_root(&json)?;
    assert!(matches!(
        LocalLogStorageRootPublicationPlanV3::from_normalized(
            normalized,
            other.candidate_binding().clone()
        ),
        Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant { .. })
    ));
    assert!(plan.same_plan_as(&codec.prepare_root_publication(
        &fixture.database_incarnation_id,
        &fixture.scope_incarnation_id,
        &root
    )?));
    assert_eq!(codec.encode_root(&root)?, json);
    Ok(())
}
