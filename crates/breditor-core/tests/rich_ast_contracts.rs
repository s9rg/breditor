#![cfg(feature = "experimental-rich-content")]
//! Public admission/directory regressions through the existing bounded codec.

use breditor_core::{
    codec::{DocumentJsonCodecV2, DocumentV2CodecError},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        BlockId, CellId, ColumnId, ImageId, RichDocument, RichDocumentError, RowId, TableId,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion, ValidationCode},
};
use breditor_core::{
    rich_content::{
        ImageAlt, ImageSize,
        actions::{
            ResizeColumn, ResizeImage, RichAction, RichActionError, SetImageAlt, apply_batch,
        },
    },
    state::EditorContext,
};
use proptest::{
    prelude::*,
    test_runner::{RngAlgorithm, RngSeed},
};
use serde_json::{Value, json};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn schema() -> Result<CompiledSchema, Box<dyn std::error::Error>> {
    Ok(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-ast")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?)
}

fn element(kind: &str, properties: Value, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element", "type":format!("breditor/{kind}"), "entityId":null});
    node["properties"] = properties;
    node["children"] = children.into();
    node
}

fn paragraph(id: &str, text: &str) -> Value {
    element(
        "paragraph",
        json!({"breditor/block-id":id}),
        if text.is_empty() {
            vec![]
        } else {
            vec![json!({"kind":"text", "text":text, "formats":[]})]
        },
    )
}

fn image(prefix: &str) -> Value {
    element(
        "image",
        json!({
            "breditor/block-id":format!("{prefix}-image-block"),
            "breditor/image-id":format!("{prefix}-image"),
            "breditor/asset-id":"asset-original", "breditor/asset-generation":"generation-original",
            "breditor/alt-text":"A 🙂 landscape", "breditor/decorative":false,
            "breditor/width":640, "breditor/height":480,
        }),
        vec![paragraph(&format!("{prefix}-caption"), "Caption e\u{301}")],
    )
}

fn table(prefix: &str, rows: &[&str], columns: &[&str]) -> Value {
    let row_nodes = rows
        .iter()
        .map(|row| {
            let cells = columns
                .iter()
                .map(|column| {
                    element(
                        "table-cell",
                        json!({
                            "breditor/block-id":format!("{prefix}-cell-{row}-{column}"),
                            "breditor/column-id":column, "breditor/header":false,
                        }),
                        vec![paragraph(
                            &format!("{prefix}-body-{row}-{column}"),
                            &format!("{row}:{column} 🙂"),
                        )],
                    )
                })
                .collect();
            element(
                "table-row",
                json!({"breditor/block-id":format!("{prefix}-row-{row}"), "breditor/row-id":row}),
                cells,
            )
        })
        .collect();
    element(
        "table",
        json!({
            "breditor/block-id":format!("{prefix}-table-block"), "breditor/table-id":prefix,
            "breditor/columns":columns.iter().map(|id| json!({"id":id,"width":120})).collect::<Vec<_>>(),
            "breditor/merges":[], "breditor/retracted-merges":[],
        }),
        row_nodes,
    )
}

fn merge(id: &str, writer: &str) -> Value {
    json!({"id":id,"lamport":"18446744073709551615","writer":writer,"counter":"18446744073709551615",
        "rows":["r0","r1"],"columns":["c0","c1"],
        "first-row":"r0","last-row":"r1","first-column":"c0","last-column":"c1"})
}

fn envelope(schema: &CompiledSchema, children: Vec<Value>) -> Value {
    json!({"format":"breditor/document", "formatVersion":2,
        "schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},
        "schemaFingerprint":schema.fingerprint().to_string(),
        "root":element("document",json!({"breditor/document-id":"document-one"}),children)})
}

fn admit(children: Vec<Value>) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let schema = schema()?;
    let codec = DocumentJsonCodecV2::new(schema.clone());
    let document = codec.decode(&serde_json::to_string(&envelope(&schema, children))?)?;
    Ok(RichDocument::try_admit(&schema, document, &DocumentLimits::default())?)
}

fn rejects(children: Vec<Value>, expected: ValidationCode) -> TestResult {
    let schema = schema()?;
    let result = DocumentJsonCodecV2::new(schema.clone())
        .decode(&serde_json::to_string(&envelope(&schema, children))?);
    let Err(DocumentV2CodecError::Validation(report)) = result else {
        return Err("expected semantic admission failure".into());
    };
    assert!(report.contains(expected), "{report:?}");
    Ok(())
}

fn cell_id(table: &str, row: &str, column: &str) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(TableId::try_new(table)?, RowId::try_new(row)?, ColumnId::try_new(column)?))
}

#[test]
fn rich_flow_and_merged_cell_bodies_round_trip_without_flattening() -> TestResult {
    let mut grid = table("t", &["r0", "r1"], &["c0", "c1"]);
    grid["properties"]["breditor/merges"] = json!([merge("m", "9007199254740993")]);
    grid["children"][0]["children"][0]["children"]
        .as_array_mut()
        .ok_or("cell bodies")?
        .push(image("inside"));
    let rich = admit(vec![paragraph("intro", "Intro"), grid, image("outside")])?;
    let table = rich.table(&TableId::try_new("t")?)?.ok_or("table view")?;
    assert_eq!(table.columns()[0].width(), 120);
    assert_eq!(table.rows(), &[RowId::try_new("r0")?, RowId::try_new("r1")?]);
    assert_eq!(table.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 4);
    for (row, column) in [("r0", "c0"), ("r0", "c1"), ("r1", "c0"), ("r1", "c1")] {
        let node = rich
            .document()
            .node_at(rich.cell_path(&cell_id("t", row, column)?).ok_or("base cell path")?)?;
        let body = node
            .as_element()
            .ok_or("cell element")?
            .children()
            .get(0)
            .and_then(|node| node.as_element())
            .ok_or("body")?;
        assert_eq!(
            body.children().get(0).and_then(|node| node.as_text()).ok_or("text")?.text(),
            format!("{row}:{column} 🙂")
        );
    }
    let codec = DocumentJsonCodecV2::new(schema()?);
    let encoded = codec.encode(rich.document())?;
    let restored = codec.decode(&encoded)?;
    assert_eq!(codec.encode(&restored)?, encoded);
    assert_eq!(restored.root(), rich.document().root());
    assert_eq!(rich.id().as_str(), "document-one");
    Ok(())
}

#[test]
fn duplicate_ids_are_rejected_with_separate_typed_identity_domains() -> TestResult {
    rejects(
        vec![paragraph("same", "first"), paragraph("same", "second")],
        ValidationCode::DuplicateContentId,
    )?;
    let mut second = image("second");
    second["properties"]["breditor/image-id"] = "first-image".into();
    rejects(vec![image("first"), second], ValidationCode::DuplicateContentId)?;
    let mut second = table("second", &[], &[]);
    second["properties"]["breditor/table-id"] = "first".into();
    rejects(vec![table("first", &[], &[]), second], ValidationCode::DuplicateContentId)?;
    let mut same_bytes = image("valid");
    same_bytes["properties"]["breditor/image-id"] = "valid-image-block".into();
    admit(vec![same_bytes])?; // ImageId and BlockId are not interchangeable.
    Ok(())
}

#[test]
fn axis_identities_are_table_scoped_but_block_ids_are_document_unique() -> TestResult {
    let rich = admit(vec![table("a", &["r"], &["c"]), table("b", &["r"], &["c"])])?;
    assert!(rich.cell_path(&cell_id("a", "r", "c")?).is_some());
    assert!(rich.cell_path(&cell_id("b", "r", "c")?).is_some());
    let mut grid = table("a", &["r0", "r1"], &["c"]);
    grid["children"][1]["properties"]["breditor/row-id"] = "r0".into();
    rejects(vec![grid], ValidationCode::RichContentContract)?;
    Ok(())
}

#[test]
fn columns_and_base_cells_must_match_exactly_in_order() -> TestResult {
    for mutation in 0..6 {
        let mut grid = table("t", &["r0", "r1"], &["c0", "c1"]);
        match mutation {
            0 => {
                grid["children"][0]["children"].as_array_mut().ok_or("cells")?.pop();
            }
            1 => {
                grid["children"][0]["children"].as_array_mut().ok_or("cells")?.reverse();
            }
            2 => {
                grid["properties"]["breditor/columns"][1]["id"] = "c0".into();
            }
            3 => {
                grid["properties"]["breditor/columns"][0]["width"] = 31.into();
            }
            4 => {
                grid["properties"]["breditor/columns"][0]["width"] = 4097.into();
            }
            _ => {
                grid["properties"]["breditor/columns"][0]["url"] =
                    "https://example.test/private".into();
            }
        }
        rejects(vec![grid], ValidationCode::RichContentContract)?;
    }
    Ok(())
}

#[test]
fn nested_table_is_rejected_even_when_hidden_inside_a_list_item() -> TestResult {
    let mut outer = table("outer", &["r"], &["c"]);
    let nested = table("inner", &["r"], &["c"]);
    outer["children"][0]["children"][0]["children"] = json!([element(
        "bullet-list",
        json!({"breditor/block-id":"list"}),
        vec![element(
            "list-item",
            json!({"breditor/block-id":"item"}),
            vec![paragraph("lead", "Leading block"), nested]
        )]
    )]);
    rejects(vec![outer], ValidationCode::NestedTable)?;
    // A table in a root-level list is valid; only ancestor tables forbid it.
    admit(vec![element(
        "bullet-list",
        json!({"breditor/block-id":"list"}),
        vec![element(
            "list-item",
            json!({"breditor/block-id":"item"}),
            vec![paragraph("lead", "Leading block"), table("inner", &["r"], &["c"])],
        )],
    )])?;
    Ok(())
}

#[test]
fn nested_table_depth_is_restored_before_the_next_root_sibling() -> TestResult {
    admit(vec![table("a", &["r"], &["c"]), table("b", &["r"], &["c"]), paragraph("tail", "Tail")])?;
    Ok(())
}

#[test]
fn list_items_allow_multiple_flow_blocks_but_require_a_leading_text_block() -> TestResult {
    let list = |children| {
        element(
            "ordered-list",
            json!({"breditor/block-id":"list", "breditor/start":3}),
            vec![element("list-item", json!({"breditor/block-id":"item"}), children)],
        )
    };
    admit(vec![list(vec![paragraph("p0", "first"), paragraph("p1", "second"), image("i")])])?;
    rejects(
        vec![list(vec![image("i"), paragraph("p0", "late")])],
        ValidationCode::RichContentContract,
    )?;
    let mut overflow = list(vec![paragraph("p0", "first")]);
    overflow["properties"]["breditor/start"] = 2_147_483_647_i64.into();
    overflow["children"].as_array_mut().ok_or("items")?.push(element(
        "list-item",
        json!({"breditor/block-id":"other-item"}),
        vec![paragraph("p1", "second")],
    ));
    rejects(vec![overflow], ValidationCode::RichContentContract)?;
    Ok(())
}

#[test]
fn images_require_explicit_alt_intent_and_atomic_paired_size() -> TestResult {
    for (key, value) in [
        ("breditor/alt-text", json!(" ")),
        ("breditor/alt-text", json!("x".repeat(4097))),
        ("breditor/decorative", json!(true)),
        ("breditor/decorative", json!("false")),
        ("breditor/width", json!(0)),
        ("breditor/height", json!(4097)),
        ("breditor/asset-id", json!("https://example.test/signed?token=secret")),
        ("breditor/asset-generation", json!("")),
    ] {
        let mut node = image("i");
        node["properties"][key] = value;
        rejects(vec![node], ValidationCode::RichContentContract)?;
    }
    let mut node = image("i");
    node["properties"].as_object_mut().ok_or("properties")?.remove("breditor/height");
    rejects(vec![node], ValidationCode::RichContentContract)?;
    let mut decorative = image("i");
    decorative["properties"]["breditor/decorative"] = true.into();
    decorative["properties"]["breditor/alt-text"] = "".into();
    let rich = admit(vec![decorative])?;
    let binding = rich.image(&ImageId::try_new("i-image")?)?.ok_or("image")?;
    assert!(binding.alt().is_decorative());
    assert_eq!(binding.size().ok_or("size")?.width(), 640);
    Ok(())
}

#[test]
fn absent_properties_do_not_get_silent_defaults() -> TestResult {
    for key in
        ["breditor/block-id", "breditor/asset-id", "breditor/alt-text", "breditor/decorative"]
    {
        let mut node = image("i");
        node["properties"].as_object_mut().ok_or("properties")?.remove(key);
        rejects(vec![node], ValidationCode::MissingRequiredElementProperty)?;
    }
    let mut grid = table("t", &["r"], &["c"]);
    grid["properties"].as_object_mut().ok_or("properties")?.remove("breditor/merges");
    rejects(vec![grid], ValidationCode::MissingRequiredElementProperty)?;
    Ok(())
}

#[test]
fn browser_state_and_derived_spans_are_not_ast_properties() -> TestResult {
    for (mut node, key) in [
        (image("i"), "breditor/url"),
        (image("i"), "breditor/upload-status"),
        (table("t", &["r"], &["c"]), "breditor/rowspan"),
        (paragraph("p", "text"), "example/metadata"),
    ] {
        node["properties"][key] = "private-token".into();
        rejects(vec![node], ValidationCode::UnknownElementProperty)?;
    }
    let mut grid = table("t", &["r"], &["c"]);
    grid["children"][0]["children"][0]["properties"]["breditor/header"] = 1.into();
    rejects(vec![grid], ValidationCode::RichContentContract)?;
    Ok(())
}

#[test]
fn exact_causal_words_and_canonical_merge_identity_order_are_required() -> TestResult {
    let mut grid = table("t", &["r0", "r1"], &["c0", "c1"]);
    grid["properties"]["breditor/merges"] = json!([merge("a", "9"), merge("z", "10")]);
    let rich = admit(vec![grid.clone()])?;
    assert_eq!(
        rich.table(&TableId::try_new("t")?)?.ok_or("table")?.geometry().active_regions()[0]
            .as_str(),
        "z"
    );
    for (key, value) in [
        ("writer", json!(0)),
        ("writer", json!("0")),
        ("writer", json!("01")),
        ("counter", json!("+1")),
        ("lamport", json!("18446744073709551616")),
        ("counter", json!("1.0")),
    ] {
        let mut bad = grid.clone();
        bad["properties"]["breditor/merges"][0][key] = value;
        rejects(vec![bad], ValidationCode::RichContentContract)?;
    }
    for records in
        [json!([merge("z", "10"), merge("a", "9")]), json!([merge("a", "9"), merge("a", "9")])]
    {
        let mut bad = grid.clone();
        bad["properties"]["breditor/merges"] = records;
        rejects(vec![bad], ValidationCode::RichContentContract)?;
    }
    grid["properties"]["breditor/retracted-merges"] = json!(["z"]);
    assert_eq!(
        admit(vec![grid])?
            .table(&TableId::try_new("t")?)?
            .ok_or("table")?
            .geometry()
            .active_regions()[0]
            .as_str(),
        "a"
    );
    Ok(())
}

#[test]
fn empty_axes_retain_hidden_table_metadata_without_inventing_cells() -> TestResult {
    for (rows, columns) in [(&[][..], &[][..]), (&["r"][..], &[][..]), (&[][..], &["c"][..])] {
        let rich = admit(vec![table("t", rows, columns)])?;
        let view = rich.table(&TableId::try_new("t")?)?.ok_or("table")?;
        assert!(view.geometry().is_hidden());
        assert!(view.geometry().cells().is_empty());
    }
    Ok(())
}

#[test]
fn strict_rich_document_admission_rechecks_binding_and_tighter_host_limits() -> TestResult {
    let rich = admit(vec![table("t", &["r"], &["c"]), image("i")])?;
    let independently_compiled = schema()?;
    RichDocument::try_admit(
        &independently_compiled,
        rich.document().clone(),
        &DocumentLimits::default(),
    )?;
    assert!(matches!(
        RichDocument::try_admit(
            &independently_compiled,
            rich.document().clone(),
            &DocumentLimits::default().with_max_nodes(2)
        ),
        Err(RichDocumentError::Validation(_))
    ));
    assert!(matches!(
        RichDocument::try_admit(
            &CompiledSchema::breditor_base(),
            rich.document().clone(),
            &DocumentLimits::default()
        ),
        Err(RichDocumentError::UnsupportedSchema)
    ));
    let other = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/other")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert!(matches!(
        RichDocument::try_admit(&other, rich.document().clone(), &DocumentLimits::default()),
        Err(RichDocumentError::SchemaBinding)
    ));
    Ok(())
}

#[test]
fn directory_paths_change_on_reorder_but_content_identity_does_not() -> TestResult {
    let first = admit(vec![table("t", &["r0", "r1"], &["c0", "c1"])])?;
    let second = admit(vec![table("t", &["r1", "r0"], &["c1", "c0"])])?;
    let cell = cell_id("t", "r0", "c0")?;
    assert_eq!(first.cell_path(&cell).ok_or("first path")?.to_vec(), vec![0, 0, 0]);
    assert_eq!(second.cell_path(&cell).ok_or("second path")?.to_vec(), vec![0, 1, 1]);
    assert_ne!(
        first.block_path(&BlockId::try_new("t-body-r0-c0")?),
        second.block_path(&BlockId::try_new("t-body-r0-c0")?)
    );
    assert!(first.image(&ImageId::try_new("missing")?)?.is_none());
    Ok(())
}

#[test]
fn table_count_product_and_context_limits_reject_before_derived_grid_allocation() -> TestResult {
    let mut grid = table("t", &[], &[]);
    grid["properties"]["breditor/columns"] = json!(
        (0..129).map(|index| json!({"id":format!("c{index}"),"width":120})).collect::<Vec<_>>()
    );
    rejects(vec![grid], ValidationCode::RichContentContract)?;
    let rows: Vec<_> = (0..65).map(|index| format!("r{index}")).collect();
    let columns: Vec<_> = (0..64).map(|index| format!("c{index}")).collect();
    // Keep the raw input below the generic property budget so this exercises
    // semantic product admission, not an earlier JSON-resource rejection.
    let mut oversized = table("t", &rows.iter().map(String::as_str).collect::<Vec<_>>(), &[]);
    oversized["properties"]["breditor/columns"] =
        json!(columns.iter().map(|id| json!({"id":id,"width":120})).collect::<Vec<_>>());
    rejects(vec![oversized], ValidationCode::RichContentContract)?;
    let mut grid = table("t", &["r0", "r1"], &["c0", "c1"]);
    grid["properties"]["breditor/merges"] = json!([merge("m", "1")]);
    grid["properties"]["breditor/merges"][0]["rows"] =
        json!((0..257).map(|index| format!("r{index}")).collect::<Vec<_>>());
    rejects(vec![grid], ValidationCode::RichContentContract)?;
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig {cases:256, rng_algorithm:RngAlgorithm::ChaCha, rng_seed:RngSeed::Fixed(0x7269_6368_6173_7431), ..ProptestConfig::default()})]
    #[test]
    fn random_axis_orders_preserve_all_base_cell_ids_and_canonical_roundtrips(row_reverse in any::<bool>(), column_reverse in any::<bool>(), rows in 1usize..9, columns in 1usize..9) {
        let mut row_ids:Vec<_> = (0..rows).map(|index|format!("r{index}")).collect();
        let mut column_ids:Vec<_> = (0..columns).map(|index|format!("c{index}")).collect();
        if row_reverse {row_ids.reverse();}
        if column_reverse {column_ids.reverse();}
        let rich = admit(vec![table("t", &row_ids.iter().map(String::as_str).collect::<Vec<_>>(), &column_ids.iter().map(String::as_str).collect::<Vec<_>>())]).map_err(|error| TestCaseError::fail(error.to_string()))?;
        for row in &row_ids {for column in &column_ids {
            let id = cell_id("t",row,column).map_err(|error|TestCaseError::fail(error.to_string()))?;
            prop_assert!(rich.cell_path(&id).is_some());
        }}
        let codec = DocumentJsonCodecV2::new(schema().map_err(|error|TestCaseError::fail(error.to_string()))?);
        let bytes = codec.encode(rich.document()).map_err(|error|TestCaseError::fail(error.to_string()))?;
        let decoded = codec.decode(&bytes).map_err(|error|TestCaseError::fail(error.to_string()))?;
        prop_assert_eq!(codec.encode(&decoded).map_err(|error|TestCaseError::fail(error.to_string()))?, bytes);
    }
}

#[test]
fn image_resize_alt_and_column_actions_have_exact_local_inverses() -> TestResult {
    let original = admit(vec![table("t", &["r0", "r1"], &["c0", "c1"]), image("i")])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let codec = DocumentJsonCodecV2::new(schema()?);
    let initial = codec.encode(original.document())?;
    for action in [
        RichAction::ResizeImage(ResizeImage::capture(
            &original,
            &ImageId::try_new("i-image")?,
            Some(ImageSize::try_new(320, 240)?),
        )?),
        RichAction::ResizeImage(ResizeImage::capture(
            &original,
            &ImageId::try_new("i-image")?,
            None,
        )?),
        RichAction::SetImageAlt(SetImageAlt::capture(
            &original,
            &ImageId::try_new("i-image")?,
            ImageAlt::decorative(),
        )?),
        RichAction::SetImageAlt(SetImageAlt::capture(
            &original,
            &ImageId::try_new("i-image")?,
            ImageAlt::try_description("Different 🙂 description".into())?,
        )?),
        RichAction::ResizeColumn(ResizeColumn::capture(
            &original,
            &TableId::try_new("t")?,
            &ColumnId::try_new("c0")?,
            320,
        )?),
    ] {
        let edit = action.apply(&context, &original)?.ok_or("edit")?;
        assert_ne!(codec.encode(edit.document().document())?, initial);
        let restored = edit.inverse().apply(&context, edit.document())?.ok_or("inverse")?;
        assert_eq!(codec.encode(restored.document().document())?, initial);
        let redone = restored.inverse().apply(&context, restored.document())?.ok_or("redo")?;
        assert_eq!(
            codec.encode(redone.document().document())?,
            codec.encode(edit.document().document())?
        );
        assert_eq!(codec.encode(original.document())?, initial);
    }
    Ok(())
}

#[test]
fn local_actions_target_current_stable_ids_after_reordering_not_old_paths() -> TestResult {
    let original = admit(vec![table("t", &["r0", "r1"], &["c0", "c1"]), image("i")])?;
    let moved = admit(vec![image("i"), table("t", &["r1", "r0"], &["c1", "c0"])])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let resize_image = ResizeImage::capture(
        &original,
        &ImageId::try_new("i-image")?,
        Some(ImageSize::try_new(320, 240)?),
    )?;
    let resize_column =
        ResizeColumn::capture(&original, &TableId::try_new("t")?, &ColumnId::try_new("c0")?, 360)?;
    let candidate = resize_image.apply(&context, &moved)?.ok_or("image edit")?;
    let candidate = resize_column.apply(&context, candidate.document())?.ok_or("column edit")?;
    let view = candidate.document().table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert_eq!(view.columns()[0].id().as_str(), "c1");
    assert_eq!(view.columns()[0].width(), 120);
    assert_eq!(view.columns()[1].width(), 360);
    assert_eq!(
        candidate.document().image_path(&ImageId::try_new("i-image")?).ok_or("path")?.to_vec(),
        vec![0]
    );
    Ok(())
}

#[test]
fn stale_captured_image_binding_cannot_overwrite_later_metadata() -> TestResult {
    let original = admit(vec![image("i")])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let resize = ResizeImage::capture(
        &original,
        &ImageId::try_new("i-image")?,
        Some(ImageSize::try_new(320, 240)?),
    )?;
    let later = SetImageAlt::capture(
        &original,
        &ImageId::try_new("i-image")?,
        ImageAlt::try_description("Later description".into())?,
    )?
    .apply(&context, &original)?
    .ok_or("later edit")?;
    assert!(matches!(resize.apply(&context, later.document()), Err(RichActionError::StaleTarget)));
    assert_eq!(
        later.document().image(&ImageId::try_new("i-image")?)?.ok_or("image")?.alt().text(),
        "Later description"
    );
    let mut replaced = image("i");
    replaced["properties"]["breditor/asset-id"] = "new-asset".into();
    replaced["properties"]["breditor/asset-generation"] = "new-generation".into();
    assert!(matches!(
        resize.apply(&context, &admit(vec![replaced])?),
        Err(RichActionError::StaleTarget)
    ));
    Ok(())
}

#[test]
fn local_guard_rejects_node_identity_reuse_different_document_and_missing_targets() -> TestResult {
    let original = admit(vec![image("i")])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let resize = ResizeImage::capture(&original, &ImageId::try_new("i-image")?, None)?;
    let mut reused = image("i");
    reused["properties"]["breditor/block-id"] = "replacement-node".into();
    assert!(matches!(
        resize.apply(&context, &admit(vec![reused])?),
        Err(RichActionError::StaleTarget)
    ));
    assert!(matches!(
        resize.apply(&context, &admit(vec![paragraph("only", "")])?),
        Err(RichActionError::MissingTarget)
    ));
    let codec = DocumentJsonCodecV2::new(schema()?);
    let mut other = envelope(context.schema(), vec![image("i")]);
    other["root"]["properties"]["breditor/document-id"] = "different-document".into();
    let other = RichDocument::try_admit(
        context.schema(),
        codec.decode(&other.to_string())?,
        context.limits(),
    )?;
    assert!(matches!(resize.apply(&context, &other), Err(RichActionError::Binding)));
    assert!(matches!(
        resize.apply(&EditorContext::default(), &original),
        Err(RichActionError::Binding)
    ));
    Ok(())
}

#[test]
fn no_op_actions_still_admit_active_resource_policy_and_do_not_create_history() -> TestResult {
    let original = admit(vec![image("i")])?;
    let resize = ResizeImage::capture(
        &original,
        &ImageId::try_new("i-image")?,
        Some(ImageSize::try_new(640, 480)?),
    )?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    assert!(resize.apply(&context, &original)?.is_none());
    assert!(apply_batch(&context, &original, &[])?.is_none());
    assert!(
        apply_batch(&context, &original, &[RichAction::ResizeImage(resize.clone())])?.is_none()
    );
    let tighter = EditorContext::new(schema()?, DocumentLimits::default().with_max_nodes(1));
    assert!(resize.apply(&tighter, &original).is_err());
    assert!(apply_batch(&tighter, &original, &[]).is_err());
    Ok(())
}

#[test]
fn column_action_preserves_other_columns_cell_bodies_and_merge_metadata() -> TestResult {
    let mut grid = table("t", &["r0", "r1"], &["c0", "c1"]);
    grid["properties"]["breditor/merges"] = json!([merge("m", "1")]);
    let original = admit(vec![grid])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let first =
        ResizeColumn::capture(&original, &TableId::try_new("t")?, &ColumnId::try_new("c0")?, 220)?;
    let second =
        ResizeColumn::capture(&original, &TableId::try_new("t")?, &ColumnId::try_new("c1")?, 330)?;
    let later = second.apply(&context, &original)?.ok_or("other width")?;
    let edit = first.apply(&context, later.document())?.ok_or("target width")?;
    let view = edit.document().table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert_eq!(
        view.columns()
            .iter()
            .map(breditor_core::rich_content::RichColumn::width)
            .collect::<Vec<_>>(),
        vec![220, 330]
    );
    assert_eq!(
        view.geometry(),
        original.table(&TableId::try_new("t")?)?.ok_or("original table")?.geometry()
    );
    let undone = edit.inverse().apply(&context, edit.document())?.ok_or("inverse")?;
    assert_eq!(undone.document().document().root(), later.document().document().root());
    assert!(matches!(first.apply(&context, edit.document()), Err(RichActionError::StaleTarget)));
    for width in [0, 31, 4097, u32::MAX] {
        assert!(matches!(
            ResizeColumn::capture(
                &original,
                &TableId::try_new("t")?,
                &ColumnId::try_new("c0")?,
                width
            ),
            Err(RichActionError::ColumnWidth)
        ));
    }
    Ok(())
}

#[test]
fn a_late_stale_action_rejects_the_whole_batch_without_exposing_partial_changes() -> TestResult {
    let original = admit(vec![image("i"), table("t", &["r"], &["c"])])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let first = RichAction::ResizeColumn(ResizeColumn::capture(
        &original,
        &TableId::try_new("t")?,
        &ColumnId::try_new("c")?,
        320,
    )?);
    let resize = RichAction::ResizeImage(ResizeImage::capture(
        &original,
        &ImageId::try_new("i-image")?,
        None,
    )?);
    let stale = RichAction::SetImageAlt(SetImageAlt::capture(
        &original,
        &ImageId::try_new("i-image")?,
        ImageAlt::decorative(),
    )?);
    let codec = DocumentJsonCodecV2::new(schema()?);
    let before = codec.encode(original.document())?;
    assert!(matches!(
        apply_batch(&context, &original, &[first, resize, stale]),
        Err(RichActionError::StaleTarget)
    ));
    assert_eq!(codec.encode(original.document())?, before);
    Ok(())
}

#[test]
fn a_dependent_batch_undo_and_redo_restores_exact_canonical_bytes() -> TestResult {
    let original = admit(vec![image("i"), table("t", &["r"], &["c"])])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let resize = RichAction::ResizeImage(ResizeImage::capture(
        &original,
        &ImageId::try_new("i-image")?,
        None,
    )?);
    let staged = resize.apply(&context, &original)?.ok_or("staged")?;
    let alt = RichAction::SetImageAlt(SetImageAlt::capture(
        staged.document(),
        &ImageId::try_new("i-image")?,
        ImageAlt::decorative(),
    )?);
    let column = RichAction::ResizeColumn(ResizeColumn::capture(
        &original,
        &TableId::try_new("t")?,
        &ColumnId::try_new("c")?,
        320,
    )?);
    let edit = apply_batch(&context, &original, &[resize, alt, column])?.ok_or("batch")?;
    assert_eq!(edit.inverse().len(), 3);
    let undo = apply_batch(&context, edit.document(), edit.inverse())?.ok_or("undo batch")?;
    assert_eq!(undo.document().document().root(), original.document().root());
    let redo = apply_batch(&context, undo.document(), undo.inverse())?.ok_or("redo batch")?;
    let codec = DocumentJsonCodecV2::new(schema()?);
    assert_eq!(
        codec.encode(redo.document().document())?,
        codec.encode(edit.document().document())?
    );
    let zero = context.with_max_operations_per_transaction(0);
    assert!(matches!(
        apply_batch(&zero, &original, redo.inverse()),
        Err(RichActionError::TooManyActions)
    ));
    Ok(())
}

#[test]
fn property_budget_failure_never_publishes_a_changed_image() -> TestResult {
    let original = admit(vec![image("i")])?;
    let mut oversized_alt = String::new();
    for _ in 0..30 {
        oversized_alt.push('🙂');
    }
    let action = SetImageAlt::capture(
        &original,
        &ImageId::try_new("i-image")?,
        ImageAlt::try_description(oversized_alt)?,
    )?;
    let context = EditorContext::new(
        schema()?,
        DocumentLimits::default().with_max_property_string_bytes(100),
    );
    assert!(matches!(action.apply(&context, &original), Err(RichActionError::Validation(_))));
    assert_eq!(
        original.image(&ImageId::try_new("i-image")?)?.ok_or("image")?.alt().text(),
        "A 🙂 landscape"
    );
    Ok(())
}

#[test]
fn extension_format_contracts_are_preserved_in_cells_and_image_captions() -> TestResult {
    use breditor_core::{
        extension::{
            ExtensionId, ExtensionManifest, ExtensionVersion, InlineFormatPropertyContractV1,
            InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatSpecV1,
            PropertyPresenceV1,
        },
        schema::PersistedTypeRevision,
    };
    let kind = QualifiedName::try_new("example/link")?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(QualifiedName::try_new("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::try_new(1)?)],
        vec![InlineFormatPropertyContractV1::try_new(
            kind,
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2048)?,
            )],
        )?],
    )?;
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-links")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?,
    )?;
    let format =
        json!([{"type":"example/link","properties":{"example/href":"https://example.test/🙂"}}]);
    let mut grid = table("t", &["r"], &["c"]);
    grid["children"][0]["children"][0]["children"][0]["children"][0]["formats"] = format.clone();
    let mut picture = image("i");
    picture["children"][0]["children"][0]["formats"] = format;
    let mut value = envelope(&schema, vec![grid, picture]);
    let codec = DocumentJsonCodecV2::new(schema.clone());
    let document = codec.decode(&value.to_string())?;
    let rich = RichDocument::try_admit(&schema, document, &DocumentLimits::default())?;
    assert!(codec.encode(rich.document())?.contains("https://example.test/🙂"));
    value["root"]["children"][1]["children"][0]["children"][0]["formats"][0]["properties"] =
        json!({"example/href":5});
    assert!(
        matches!(codec.decode(&value.to_string()),Err(DocumentV2CodecError::Validation(report)) if report.contains(ValidationCode::FormatPropertyTypeMismatch))
    );
    Ok(())
}

#[test]
fn caption_shape_limits_and_duplicate_property_keys_are_not_relaxed() -> TestResult {
    let mut picture = image("i");
    picture["children"]
        .as_array_mut()
        .ok_or("caption")?
        .push(paragraph("second-caption", "No second caption"));
    rejects(vec![picture], ValidationCode::InvalidChild)?;
    let schema = schema()?;
    let json = envelope(&schema, vec![image("i")]).to_string();
    let duplicate = json.replace(
        "\"breditor/asset-id\":\"asset-original\"",
        "\"breditor/asset-id\":\"asset-original\",\"breditor/asset-id\":\"another-asset\"",
    );
    assert_ne!(duplicate, json);
    let codec = DocumentJsonCodecV2::new(schema);
    assert!(matches!(codec.decode(&duplicate), Err(DocumentV2CodecError::InvalidJson(_))));
    assert!(
        codec
            .clone()
            .with_limits(DocumentLimits::default().with_max_nodes(1))
            .decode(&json)
            .is_err()
    );
    assert!(matches!(
        codec.with_limits(DocumentLimits::default().with_max_json_bytes(1)).decode(&json),
        Err(DocumentV2CodecError::InputTooLarge { .. })
    ));
    Ok(())
}

#[test]
fn inactive_merge_intent_and_unseen_retraction_remain_lossless_admitted_data() -> TestResult {
    let mut grid = table("t", &["r1", "r0"], &["c0", "c1"]);
    grid["properties"]["breditor/merges"] = json!([merge("m", "1")]);
    grid["properties"]["breditor/retracted-merges"] = json!(["unseen"]);
    let rich = admit(vec![grid])?;
    let view = rich.table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert!(view.geometry().active_regions().is_empty());
    assert_eq!(
        view.geometry().conflicts()[0].reason(),
        breditor_core::rich_content::MergeConflictReason::AxesReordered
    );
    assert_eq!(
        view.geometry()
            .cells()
            .iter()
            .flat_map(breditor_core::rich_content::ResolvedCell::source_cells)
            .count(),
        4
    );
    let encoded = DocumentJsonCodecV2::new(schema()?).encode(rich.document())?;
    assert!(encoded.contains("\"breditor/retracted-merges\":[\"unseen\"]"));
    assert!(encoded.contains("\"id\":\"m\""));
    Ok(())
}

#[test]
fn image_metadata_action_and_inverse_preserve_a_later_caption_edit() -> TestResult {
    let original = admit(vec![image("i")])?;
    let resize = ResizeImage::capture(&original, &ImageId::try_new("i-image")?, None)?;
    let mut changed_caption = image("i");
    changed_caption["children"][0]["children"][0]["text"] = "Later caption 🙂".into();
    let later = admit(vec![changed_caption])?;
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let changed = resize.apply(&context, &later)?.ok_or("resize")?;
    let restored = changed.inverse().apply(&context, changed.document())?.ok_or("inverse")?;
    assert_eq!(restored.document().document().root(), later.document().root());
    assert_ne!(restored.document().document().root(), original.document().root());
    Ok(())
}
