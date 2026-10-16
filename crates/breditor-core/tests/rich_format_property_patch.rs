//! Field-only edits preserve mixed observed properties, exact Unicode and history.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec, RichSessionJsonCodec},
    document::Format,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{
        BlockId, RichDocument, RichLocalSession, RichSelectionUpdate,
        actions::{RichAction, RichFormatChange, RichFormatPropertyPatch, SetInlineFormat},
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn name(value: &str) -> Result<QualifiedName> {
    Ok(QualifiedName::try_new(value)?)
}
fn link(href: &str, new: bool) -> Value {
    json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":new}})
}
fn setup() -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(name("example/property-patch")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},"children":[{"kind":"text","text":"a🙂","formats":[link("https://one.test/",false),{"type":"breditor/strong","properties":{}}]},{"kind":"text","text":"b","formats":[link("https://two.test/",true)]}]}]});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/property-patch","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?,
        context.limits(),
    )?;
    Ok((context, document))
}
fn patch(
    context: &EditorContext,
    field: &str,
    href: &str,
    new: bool,
) -> Result<RichFormatPropertyPatch> {
    let formats =
        RichFormatsJsonCodec::new(context.clone()).decode(&json!([link(href, new)]).to_string())?;
    Ok(RichFormatPropertyPatch::try_new(
        formats.iter().next().ok_or("format")?.clone(),
        vec![name(field)?],
    )?)
}
fn formats(document: &RichDocument) -> Result<Vec<Format>> {
    let block = BlockId::try_new("p")?;
    let node = document
        .document()
        .node_at(document.block_path(&block).ok_or("path")?)?
        .as_element()
        .ok_or("prose")?;
    Ok(node
        .children()
        .iter()
        .map(|node| {
            node.as_text().ok_or("run").and_then(|run| {
                run.formats().get(&name("breditor-inline/link").map_err(|_| "name")?).ok_or("link")
            })
        })
        .collect::<std::result::Result<Vec<_>, _>>()?
        .into_iter()
        .cloned()
        .collect())
}
#[test]
fn url_only_patch_preserves_each_target_strong_text_and_exact_future_history() -> Result {
    let (context, document) = setup()?;
    let patch = patch(&context, "breditor-inline/href", "https://changed.test/", false)?;
    let block = BlockId::try_new("p")?;
    let ranges =
        patch.capture_runs(&document, &block, TextOffset::try_new(0)?, TextOffset::try_new(4)?)?;
    assert_eq!(ranges.len(), 2);
    let action = SetInlineFormat::capture_changes(
        &document,
        &block,
        TextOffset::try_new(0)?,
        TextOffset::try_new(4)?,
        &[RichFormatChange::Patch(patch)],
    )?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        document.clone(),
        None,
        HistoryCapacity::try_new(10)?,
    )?;
    owner.dispatch(
        &owner.snapshot(),
        &[RichAction::SetInlineFormat(action)],
        RichSelectionUpdate::Map,
    )?;
    assert_eq!(owner.undo_depth(), 1);
    let expected = RichFormatsJsonCodec::new(context.clone())
        .decode(&json!([link("https://changed.test/", false)]).to_string())?;
    let values = formats(owner.state().document())?;
    assert_eq!(
        values[0].properties().get(&name("breditor-inline/href")?),
        expected.iter().next().ok_or("format")?.properties().get(&name("breditor-inline/href")?)
    );
    let before_json =
        DocumentJsonCodecV2::new(context.schema().clone()).encode(document.document())?;
    let mut expected_json: Value = serde_json::from_str(&before_json)?;
    for run in expected_json["root"]["children"][0]["children"].as_array_mut().ok_or("runs")? {
        run["formats"][0]["properties"]["breditor-inline/href"] = json!("https://changed.test/");
    }
    assert_eq!(
        serde_json::from_str::<Value>(
            &DocumentJsonCodecV2::new(context.schema().clone())
                .encode(owner.state().document().document())?
        )?,
        expected_json
    );
    assert_eq!(
        values[0].properties().get(&name("breditor-inline/new-window")?),
        formats(&document)?[0].properties().get(&name("breditor-inline/new-window")?)
    );
    assert_eq!(
        values[1].properties().get(&name("breditor-inline/new-window")?),
        formats(&document)?[1].properties().get(&name("breditor-inline/new-window")?)
    );
    let codec = RichSessionJsonCodec::new(context);
    let mut restored = codec.decode(&codec.encode(&owner)?)?;
    for undo in [true, false, true, false] {
        if undo {
            owner.undo(&owner.snapshot())?;
            restored.undo(&restored.snapshot())?;
        } else {
            owner.redo(&owner.snapshot())?;
            restored.redo(&restored.snapshot())?;
        }
        assert_eq!(codec.encode(&owner)?, codec.encode(&restored)?);
        if undo {
            assert_eq!(owner.state().document().document(), document.document());
        }
    }
    Ok(())
}
#[test]
fn target_only_patch_keeps_distinct_urls_and_coalesces_only_equal_result_values() -> Result {
    let (context, document) = setup()?;
    let patch = patch(&context, "breditor-inline/new-window", "https://unused.test/", true)?;
    let runs = patch.capture_runs(
        &document,
        &BlockId::try_new("p")?,
        TextOffset::try_new(0)?,
        TextOffset::try_new(4)?,
    )?;
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].start.get(), 0);
    assert_eq!(runs[0].end.get(), 3);
    assert_eq!(
        runs[0].format.properties().get(&name("breditor-inline/href")?),
        formats(&document)?[0].properties().get(&name("breditor-inline/href")?)
    );
    assert!(
        patch
            .capture_runs(
                &document,
                &BlockId::try_new("p")?,
                TextOffset::try_new(3)?,
                TextOffset::try_new(4)?
            )?
            .is_empty()
    );
    Ok(())
}
#[test]
fn duplicate_missing_and_non_scalar_patch_requests_reject_before_a_partial_change() -> Result {
    let (context, document) = setup()?;
    let template = formats(&document)?[0].clone();
    assert!(RichFormatPropertyPatch::try_new(template.clone(), vec![]).is_err());
    assert!(
        RichFormatPropertyPatch::try_new(
            template.clone(),
            vec![name("breditor-inline/href")?, name("breditor-inline/href")?]
        )
        .is_err()
    );
    assert!(RichFormatPropertyPatch::try_new(template, vec![name("example/unknown")?]).is_err());
    let patch = patch(&context, "breditor-inline/href", "https://changed.test/", false)?;
    for (start, end) in [(0, 0), (0, 2), (4, 3), (0, 5)] {
        assert!(
            patch
                .capture_runs(
                    &document,
                    &BlockId::try_new("p")?,
                    TextOffset::try_new(start)?,
                    TextOffset::try_new(end)?
                )
                .is_err()
        );
    }
    Ok(())
}
