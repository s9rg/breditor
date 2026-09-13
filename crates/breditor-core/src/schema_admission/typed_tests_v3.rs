use super::*;
use crate::{
    document::{Format, PropertyInteger, PropertyValue},
    extension::{
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        PropertyPresenceV1,
    },
};

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn context(maximum: i64) -> Result<EditorContext, Box<dyn Error>> {
    let format = name("example/admission-format")?;
    let specs = vec![
        InlineFormatPropertySpecV1::new(
            name("example/enabled")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::boolean(),
        ),
        InlineFormatPropertySpecV1::new(
            name("example/size")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_integer(
                None,
                Some(PropertyInteger::try_new(maximum)?),
            )?,
        ),
        InlineFormatPropertySpecV1::new(
            name("example/url")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 128)?,
        ),
    ];
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/admission-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format.clone(), PersistedTypeRevision::one())],
        vec![InlineFormatPropertyContractV1::try_new(format, specs)?],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/admission-profile")?, SchemaVersion::try_new(1)?),
        &extensions,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}

fn typed_source() -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    let context = context(2)?;
    let mut session = EditorSession::new(state(&context, "typed-source", 1)?);
    let properties = PropertyMap::try_from_sorted(vec![
        (name("example/enabled")?, PropertyValue::boolean(true)),
        (name("example/size")?, PropertyValue::from_integer(PropertyInteger::try_new(2)?)),
        (name("example/url")?, PropertyValue::from_string("https://example.test/private")),
    ])?;
    let formats = FormatSet::try_from_formats(vec![Format::new(
        name("example/admission-format")?,
        properties,
    )])?;
    let splice = TextSplice::capture(
        &context,
        session.state().document(),
        TextRange::try_new(
            NodePath::try_from_indices(vec![0])?,
            TextOffset::ZERO,
            TextOffset::ZERO,
        )?,
        TextRun::try_new("private typed content", formats)?.into(),
    )?;
    let transaction = Transaction::new(session.state(), vec![splice.into()]);
    assert!(session.apply_transaction(&transaction)?.into_commit().is_some());
    LocalLogCheckpointAnchor::try_from_checkpoint_parts(
        LocalSessionId::try_new("typed-source-session")?,
        LocalLogId::try_new("typed-source-checkpoint")?,
        LocalLogId::try_new("typed-source-active")?,
        LocalLogCompactionLimits::default(),
        session,
        BTreeMap::from([(ReplayId::try_new("typed-source-replay")?, LocalLogSequence::FIRST)]),
        Some(LocalLogSequence::FIRST),
    )
    .map_err(|error| test_failure(format!("invalid typed source: {error:?}")).into())
}

fn request(maximum: i64) -> Result<SchemaAdmissionRequest, Box<dyn Error>> {
    Ok(SchemaAdmissionRequest::new(
        context(maximum)?,
        LineageId::try_new("typed-target")?,
        LocalLogCheckpointBinding::try_new(
            LocalSessionId::try_new("typed-target-session")?,
            LocalLogId::try_new("typed-target-checkpoint")?,
            LocalLogId::try_new("typed-target-active")?,
        )?,
        HistoryCapacity::default(),
    ))
}

#[test]
fn typed_admission_preserves_all_property_kinds_and_resets_only_session_state() -> TestResult {
    let source = typed_source()?;
    let source_codec = LocalLogCheckpointJsonCodecV3::new(
        source.session().state().context().clone(),
        LocalLogCheckpointBinding::try_new(
            source.session_id().clone(),
            source.checkpoint_log_id().clone(),
            source.successor_log_id().clone(),
        )?,
    );
    let before = source_codec.encode(&source)?;
    let target = request(3)?;
    let prepared = target.try_prepare_v3(&source)?;
    let anchor = prepared.target_checkpoint();
    assert_eq!(
        anchor.session().state().document().root(),
        source.session().state().document().root()
    );
    assert!(
        anchor
            .session()
            .state()
            .document()
            .root()
            .shares_allocation_with(source.session().state().document().root())
    );
    assert_eq!(anchor.session().state().snapshot().revision(), Revision::ZERO);
    assert_eq!(anchor.session().undo_depth(), 0);
    assert_eq!(anchor.session().redo_depth(), 0);
    assert_eq!(anchor.compacted_replay_count(), 0);
    assert_eq!(anchor.checkpoint_covered_through(), None);
    assert_eq!(anchor.session().state().selection(), None);
    assert_eq!(anchor.session().state().pending_formats(), None);
    let checkpoint_codec = LocalLogCheckpointJsonCodecV3::new(
        target.target_context().clone(),
        target.target_checkpoint_binding().clone(),
    );
    let restored = checkpoint_codec.decode(prepared.target_checkpoint_json())?;
    assert_eq!(restored.session().state(), anchor.session().state());
    assert_eq!(checkpoint_codec.encode(&restored)?, prepared.target_checkpoint_json());
    assert_eq!(source_codec.encode(&source)?, before);
    assert_eq!(source.session().undo_depth(), 1);
    assert!(!format!("{prepared:?}").contains("private"));
    Ok(())
}

#[test]
fn narrowing_the_property_domain_fails_without_rewriting_the_source() -> TestResult {
    let source = typed_source()?;
    let before = source.session().state().clone();
    let history = source.session().history_status();
    let error =
        request(1)?.try_prepare_v3(&source).err().ok_or("narrowed domain accepted size 2")?;
    assert!(
        matches!(error, SchemaAdmissionV3Error::Document(error) if matches!(*error, DocumentSchemaAdmissionError::TargetValidation(_)))
    );
    assert_eq!(source.session().state(), &before);
    assert_eq!(source.session().history_status(), history);
    // Failure does not consume the source or prevent a later compatible admission.
    assert!(request(3)?.try_prepare_v3(&source).is_ok());
    Ok(())
}

#[test]
fn typed_admission_prepares_only_an_exact_matching_v3_root() -> TestResult {
    use crate::codec::{LocalLogStorageGenerationLimits, LocalLogStorageRootV3CodecError};
    let source = typed_source()?;
    let target = request(3)?;
    let mut prepared = target.try_prepare_v3(&source)?;
    let binding = LocalLogStorageRootBinding::new(
        LocalLogStorageProfileId::try_new("example/admission-storage")?,
        LocalLogStorageProfileVersion::try_new(1)?,
        LocalLogStorageScopeId::try_new("typed-target-scope")?,
        LocalLogStorageHeadId::try_new("typed-target-head")?,
    );
    let codec =
        LocalLogStorageRootJsonCodecV3::new(target.target_context().clone(), binding.clone());
    let inputs = LocalLogStorageRootPreparationInputs::new(
        LocalLogStorageTransactionId::try_new("typed-target-transaction")?,
        LocalLogStorageFenceId::try_new("typed-target-fence")?,
        LocalLogFrameLimits::default(),
    );
    let root = codec.prepare_root_from_schema_admission(&prepared, &inputs)?;
    let json = codec.encode_root(&root)?;
    assert_eq!(codec.decode_root(&json)?, root);
    assert_eq!(root.checkpoint_json(), prepared.target_checkpoint_json());
    assert_eq!(root.active_frame().format_version(), 3);
    let wrong =
        LocalLogStorageRootJsonCodecV3::new(source.session().state().context().clone(), binding);
    assert!(matches!(
        wrong.prepare_root_from_schema_admission(&prepared, &inputs),
        Err(LocalLogStorageRootV3CodecError::ContextConfigurationMismatch)
    ));
    let short = codec.clone().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_checkpoint_json_bytes(prepared.target_checkpoint_json().len() - 1),
    );
    assert!(matches!(
        short.prepare_root_from_schema_admission(&prepared, &inputs),
        Err(LocalLogStorageRootV3CodecError::ResourceLimit(_))
    ));
    // Private corruption proves the bridge rechecks byte/owner coupling even
    // though public callers cannot manufacture a prepared value.
    let original = prepared.target_checkpoint_json.clone();
    prepared.target_checkpoint_json =
        original.replace("private typed content", "altered typed content");
    assert_ne!(prepared.target_checkpoint_json, original);
    assert!(matches!(
        codec.prepare_root_from_schema_admission(&prepared, &inputs),
        Err(LocalLogStorageRootV3CodecError::NonCanonicalCheckpointJson)
    ));
    prepared.target_checkpoint_json = original;
    assert_eq!(codec.prepare_root_from_schema_admission(&prepared, &inputs)?, root);
    Ok(())
}
