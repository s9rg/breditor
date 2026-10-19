//! Native asset reads must retain invisible Undo/Redo content without authoring a history action.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        AssetGeneration, AssetId, ImageId, RichAssetReferenceError, RichDocument, RichLocalSession,
        RichSelectionUpdate,
        actions::{DeleteImage, ReplaceImage, RichAction},
        inspect_rich_asset_references,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn encoded_retained_pairs_have_independent_scope_binding_and_exact_decimal_revision() -> Result {
    use breditor_core::codec::{RichAssetRetention, encode_rich_asset_references};
    let owner = owner(100)?;
    let pairs = owner.retained_asset_references(&owner.snapshot())?;
    for (retention, name) in [
        (RichAssetRetention::LocalHistory, "local-history"),
        (RichAssetRetention::SharedCausal, "shared-causal"),
    ] {
        let input =
            encode_rich_asset_references(owner.state().document(), u64::MAX, retention, &pairs)?;
        let value: Value = serde_json::from_str(&input)?;
        assert_eq!(value["format"], "breditor/rich-retained-asset-references");
        assert_eq!(value["formatVersion"], 1);
        assert_eq!(value["revision"], u64::MAX.to_string());
        assert_eq!(value["retention"], name);
        assert_eq!(value["document"], "room");
        assert_eq!(
            value["schema"]["fingerprint"],
            owner.state().document().document().schema_fingerprint().to_string()
        );
        assert_eq!(value["references"], json!([{"asset":"asset","generation":"generation"}]));
    }
    Ok(())
}

#[test]
fn retained_pair_encoder_rejects_duplicate_unsorted_and_excessive_results() -> Result {
    use breditor_core::codec::{
        RichAssetReferenceCodecError, RichAssetRetention, encode_rich_asset_references,
    };
    use breditor_core::rich_content::{RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference};
    let owner = owner(100)?;
    let a = RichAssetReference::try_new("a", "generation")?;
    let b = RichAssetReference::try_new("b", "generation")?;
    let encode = |pairs: &[RichAssetReference]| {
        encode_rich_asset_references(
            owner.state().document(),
            0,
            RichAssetRetention::LocalHistory,
            pairs,
        )
    };
    assert!(encode(&[]).is_ok());
    assert!(encode(&[a.clone(), b.clone()]).is_ok());
    assert_eq!(encode(&[b, a.clone()]), Err(RichAssetReferenceCodecError::Order));
    assert_eq!(encode(&[a.clone(), a.clone()]), Err(RichAssetReferenceCodecError::Order));
    assert_eq!(
        encode(&vec![a; RICH_ASSET_REFERENCE_MAX_BINDINGS + 1]),
        Err(RichAssetReferenceCodecError::Limit)
    );
    Ok(())
}

#[test]
fn retained_pair_encoded_byte_limit_rejects_complete_result_without_a_prefix() -> Result {
    use breditor_core::codec::{
        RichAssetReferenceCodecError, RichAssetRetention, encode_rich_asset_references,
    };
    use breditor_core::rich_content::RichAssetReference;
    let owner = owner(100)?;
    let pairs = (0..40000)
        .map(|n| {
            RichAssetReference::try_new(&format!("a{n:06}{}", "x".repeat(121)), &"g".repeat(128))
        })
        .collect::<std::result::Result<Vec<_>, _>>()?;
    assert_eq!(
        encode_rich_asset_references(
            owner.state().document(),
            0,
            RichAssetRetention::LocalHistory,
            &pairs
        ),
        Err(RichAssetReferenceCodecError::Limit)
    );
    Ok(())
}
fn context() -> Result<EditorContext> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_rich_content_profile(
            SchemaId::new(
                QualifiedName::try_new("example/asset-reads")?,
                SchemaVersion::try_new(1)?,
            ),
            &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
        )?,
        DocumentLimits::default(),
    ))
}
fn owner(capacity: u32) -> Result<RichLocalSession> {
    let context = context()?;
    let root: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/asset-reads","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    Ok(RichLocalSession::try_new(context, document, None, HistoryCapacity::try_new(capacity)?)?)
}
fn references(owner: &RichLocalSession) -> Result<Vec<(String, String)>> {
    Ok(owner
        .retained_asset_references(&owner.snapshot())?
        .iter()
        .map(|r| (r.asset().as_str().into(), r.generation().as_str().into()))
        .collect())
}
fn replace(owner: &mut RichLocalSession, asset: &str, generation: &str) -> Result {
    let action = RichAction::ReplaceImage(ReplaceImage::capture(
        owner.state().document(),
        &ImageId::try_new("image")?,
        AssetId::try_new(asset)?,
        AssetGeneration::try_new(generation)?,
    )?);
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?;
    Ok(())
}
#[test]
fn replacement_and_deleted_image_retain_exact_before_after_and_redo_bindings() -> Result {
    let mut a = owner(100)?;
    replace(&mut a, "asset-b", "generation-b")?;
    let expected =
        vec![("asset".into(), "generation".into()), ("asset-b".into(), "generation-b".into())];
    assert_eq!(references(&a)?, expected);
    let action = RichAction::DeleteImage(DeleteImage::capture(
        a.state().document(),
        &ImageId::try_new("image")?,
        None,
    )?);
    a.dispatch(&a.snapshot(), &[action], RichSelectionUpdate::Map)?;
    assert!(inspect_rich_asset_references(a.state().document())?.is_empty());
    assert_eq!(references(&a)?, expected);
    let codec = RichSessionJsonCodec::new(context()?);
    let before = codec.encode(&a)?;
    let observation = a.snapshot();
    for _ in 0..4 {
        assert_eq!(references(&a)?, expected);
    }
    a.check_observation(&observation)?;
    assert_eq!(codec.encode(&a)?, before);
    let mut restored = codec.decode(&before)?;
    for redo in [false, false, true, true] {
        if redo {
            a.redo(&a.snapshot())?;
            restored.redo(&restored.snapshot())?;
        } else {
            a.undo(&a.snapshot())?;
            restored.undo(&restored.snapshot())?;
        }
        assert_eq!(references(&a)?, expected);
        assert_eq!(references(&restored)?, expected);
        assert_eq!(codec.encode(&a)?, codec.encode(&restored)?);
    }
    Ok(())
}
#[test]
fn discarded_redo_branch_is_not_confused_with_current_native_retention() -> Result {
    let mut a = owner(100)?;
    replace(&mut a, "asset-b", "generation-b")?;
    a.undo(&a.snapshot())?;
    assert_eq!(references(&a)?.len(), 2);
    replace(&mut a, "asset-c", "generation-c")?;
    assert!(!a.can_redo());
    assert_eq!(
        references(&a)?,
        vec![("asset".into(), "generation".into()), ("asset-c".into(), "generation-c".into())]
    );
    Ok(())
}
#[test]
fn local_capacity_drops_only_unretained_states_and_keeps_the_remaining_before_state() -> Result {
    let mut a = owner(1)?;
    replace(&mut a, "asset-b", "generation-b")?;
    replace(&mut a, "asset-c", "generation-c")?;
    assert_eq!(
        references(&a)?,
        vec![("asset-b".into(), "generation-b".into()), ("asset-c".into(), "generation-c".into())]
    );
    Ok(())
}
#[test]
fn same_asset_different_generations_are_not_collapsed_or_cross_paired() -> Result {
    let mut a = owner(100)?;
    replace(&mut a, "asset", "another-generation")?;
    assert_eq!(
        references(&a)?,
        vec![("asset".into(), "another-generation".into()), ("asset".into(), "generation".into())]
    );
    Ok(())
}
#[test]
fn stale_foreign_and_read_only_reads_preserve_the_exact_owner() -> Result {
    let mut a = owner(100)?;
    let foreign = owner(100)?.snapshot();
    let stale = a.snapshot();
    replace(&mut a, "asset-b", "generation-b")?;
    let codec = RichSessionJsonCodec::new(context()?);
    let before = codec.encode(&a)?;
    for observation in [&foreign, &stale] {
        assert_eq!(
            a.retained_asset_references(observation),
            Err(RichAssetReferenceError::Observation)
        );
        assert_eq!(codec.encode(&a)?, before);
    }
    a.undo(&a.snapshot())?;
    a.set_read_only(&a.snapshot(), true)?;
    let before = codec.encode(&a)?;
    assert_eq!(references(&a)?.len(), 2);
    assert_eq!(codec.encode(&a)?, before);
    Ok(())
}
