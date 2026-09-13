use super::*;
use crate::document::PropertyInteger;
use crate::local_log::{LocalLogEntry, LocalLogEvent, LocalLogSequence, ReplayId};
use crate::{
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyMap, PropertyValue,
        TextFragment, TextRun,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    schema::{PersistedTypeRevision, SchemaId, SchemaVersion},
    transaction::{Commit, Transaction},
};
const TYPED_LINK: &str = "example/tail-link";
const TYPED_HREF: &str = "example/tail-href";
fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let link = name(TYPED_LINK)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        link.clone(),
        vec![
            InlineFormatPropertySpecV1::new(
                name("example/active")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::Boolean,
            ),
            InlineFormatPropertySpecV1::new(
                name("example/size")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_integer(None, None)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(TYPED_HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 64)?,
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/tail-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(link, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/tail-v3")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn typed_formats(href: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![
        (name("example/active")?, PropertyValue::boolean(true)),
        (name("example/size")?, PropertyValue::from_integer(PropertyInteger::try_new(2)?)),
        (name(TYPED_HREF)?, PropertyValue::from_string(href)),
    ])?;
    FormatSet::try_from_formats(vec![Format::new(name(TYPED_LINK)?, properties)])
        .map_err(Into::into)
}

fn empty_paragraph() -> Result<NodeRef, Box<dyn Error>> {
    ElementNode::try_new(
        QualifiedName::from_known_static("breditor/paragraph"),
        None,
        PropertyMap::default(),
        Vec::new(),
    )
    .map(NodeRef::element)
    .map_err(Into::into)
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let root = ElementNode::try_new(
        QualifiedName::from_known_static("breditor/document"),
        None,
        PropertyMap::default(),
        vec![empty_paragraph()?, empty_paragraph()?],
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn typed_insertion_commit(
    context: &EditorContext,
    before: &EditorState,
    href: &str,
) -> Result<Commit, Box<dyn Error>> {
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    let replacement: TextFragment = TextRun::try_new("linked", typed_formats(href)?)?.into();
    let splice = TextSplice::capture(context, before.document(), range, replacement)?;
    Transaction::new(before, vec![splice.into()])
        .apply(context, before)?
        .into_commit()
        .ok_or_else(|| "typed insertion transaction unexpectedly produced no commit".into())
}

#[test]
fn typed_properties_survive_storage_root_rotation_and_history() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let before = state(&context, "storage-typed-v3")?;
    let commit = typed_insertion_commit(&context, &before, "https://example.test/docs")?;
    let after = commit.after().clone();
    let entry = LocalLogEntry::new_with_schema_binding(
        context.schema().durable_binding(),
        LocalSessionId::try_new(SESSION)?,
        LocalLogId::try_new("log:storage-v3-tests:g0")?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("storage-v3-typed-edit")?,
        LocalLogEvent::commit(commit),
    );
    let fixture = StorageV3Fixture::with_events(EditorSession::new(before.clone()), vec![entry])?;
    let root_json = fixture.encoded_root()?;
    let selected = fixture.normalize_root(&root_json)?;
    let outcome = fixture.rotation_outcome(&selected)?;
    assert_eq!(outcome.anchor().session().state(), &after);
    assert_eq!(outcome.anchor().compacted_replay_count(), 1);
    let codec = fixture.rotation_codec()?;
    let inputs = LocalLogStorageGenerationPreparationInputs::new(
        LocalLogStorageTransactionId::try_new(ROTATION_TRANSACTION)?,
        LocalLogStorageFenceId::try_new(ROTATION_FENCE)?,
        LocalLogFrameLimits::default(),
    );
    let manifest = codec.prepare_rotation_from_selected(&selected, &outcome, &inputs)?;
    let json = codec.encode_rotation_from_selected(&manifest, &selected)?;
    let restored = codec.decode_rotation_from_selected(&json, &selected)?;
    let anchor = LocalLogCheckpointJsonCodecV3::new(
        context,
        LocalLogCheckpointBinding::try_new(
            restored.session_id().clone(),
            restored.sealed_log_id().clone(),
            restored.successor_log_id().clone(),
        )?,
    )
    .decode(restored.checkpoint_json())?;
    assert_eq!(anchor.compacted_replay_count(), 1);
    let mut session = anchor.into_session();
    assert_eq!(session.state(), &after);
    assert_eq!(session.undo_depth(), 1);
    assert!(session.undo()?.is_some());
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    assert_eq!(session.state().pending_formats(), before.pending_formats());
    assert!(session.redo()?.is_some());
    assert_eq!(session.state().document(), after.document());
    assert_eq!(session.state().selection(), after.selection());
    assert_eq!(session.state().pending_formats(), after.pending_formats());
    Ok(())
}
