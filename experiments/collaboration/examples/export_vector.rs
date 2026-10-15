//! Generate a native causal-history vector for independent Wasm restoration.

use breditor_collab_feasibility::{
    actions::{Command, InsertText, ResizeColumn, SetImageAlt, SetImageAsset, TextTarget},
    anchor::Affinity,
    session::Session,
};

fn insert(offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { target: TextTarget::Body, offset, text: text.into() })
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("provide an explicit generated-vector output path")?;
    let mut a = Session::new("golden-room".into(), "9007199254740993".into())?;
    let mut b = Session::new("golden-room".into(), "9007199254740995".into())?;
    a.apply(vec![insert(0, "a🙂b")])?;
    let anchor = a.body_anchor(3, Affinity::After)?;
    a.apply(vec![
        insert(3, " local"),
        Command::SetStrong(breditor_collab_feasibility::actions::SetStrong {
            target: TextTarget::Body,
            offset: 1,
            length: 2,
            enabled: true,
        }),
    ])?;
    b.receive(a.updates()?)?;
    b.apply(vec![
        insert(0, "remote "),
        Command::SetImageAlt(SetImageAlt { image: "i".into(), alt: "remote description".into() }),
    ])?;
    a.receive(b.updates()?)?;
    a.apply(vec![
        Command::ResizeColumn(ResizeColumn { column: "c".into(), width: 300 }),
        Command::SetImageAsset(SetImageAsset { image: "i".into(), asset: "asset-native".into() }),
    ])?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let initial = a.view();
    let initial_version = a.version();
    let anchor_position = a.resolve_body_anchor(&anchor)?;
    a.redo()?;
    let after_redo = a.checkpoint()?;
    for _ in 0..3 {
        a.undo()?;
    }
    let after_undo_all = a.checkpoint()?;
    let mut vector = serde_json::json!({
        "checkpoint":checkpoint,"initial":initial,"initial_version":initial_version,
        "anchor":anchor,"anchor_position":anchor_position,"after_redo":after_redo,
        "after_undo_all":after_undo_all,"remaining":a.view(),
    });
    let mut text_flow = serde_json::Map::new();
    for scenario in breditor_collab_feasibility::text_flow_fixture::SCENARIOS {
        text_flow.insert(
            scenario.into(),
            breditor_collab_feasibility::text_flow_fixture::exercise(scenario)?.into(),
        );
    }
    vector["text_flow_expected"] = text_flow.into();
    let mut engine_history = serde_json::Map::new();
    for scenario in breditor_collab_feasibility::engine_history_fixture::SCENARIOS {
        engine_history.insert(
            scenario.into(),
            breditor_collab_feasibility::engine_history_fixture::exercise(scenario)?.into(),
        );
    }
    vector["engine_history_expected"] = engine_history.into();
    let serde_json::Value::Object(rich) = rich_vectors()? else {
        return Err("rich vectors object".into());
    };
    vector.as_object_mut().ok_or("journal vector object")?.extend(rich);
    std::fs::write(path, serde_json::to_vec_pretty(&vector)?)?;
    Ok(())
}

fn rich_vectors() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let mut rich_ast_input: serde_json::Value =
        serde_json::from_str(&breditor_collab_feasibility::rich_ast_fixture::binding()?)?;
    rich_ast_input["format"] = "breditor/document".into();
    rich_ast_input["formatVersion"] = 2.into();
    rich_ast_input["root"] = serde_json::from_str(include_str!("../browser/rich-ast-root.json"))?;
    let rich_ast_input = serde_json::to_string(&rich_ast_input)?;
    let rich_ast_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_ast_fixture::admit(&rich_ast_input)?,
    )?;
    let rich_actions_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_ast_fixture::exercise_actions(&rich_ast_input)?,
    )?;
    let table_axes_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::table_axis_fixture::exercise(&rich_ast_input)?,
    )?;
    let rich_features_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::feature_action_fixture::exercise(&rich_ast_input)?,
    )?;
    let mut rich_local_input: serde_json::Value =
        serde_json::from_str(&breditor_collab_feasibility::rich_ast_fixture::binding()?)?;
    rich_local_input["format"] = "breditor/document".into();
    rich_local_input["formatVersion"] = 2.into();
    rich_local_input["root"] = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let rich_local_input = rich_local_input.to_string();
    let rich_local_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_local_fixture::exercise(&rich_local_input)?,
    )?;
    let rich_flow_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_flow_fixture::exercise(&rich_local_input)?,
    )?;
    let rich_paste_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_paste_fixture::exercise(&rich_ast_input)?,
    )?;
    let rich_recovery_expected: serde_json::Value =
        serde_json::from_str(&breditor_collab_feasibility::rich_recovery_fixture::exercise(
            rich_flow_expected["checkpoint"].as_str().ok_or("rich checkpoint")?,
        )?)?;
    let rich_clipboard_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_clipboard_fixture::exercise(&rich_ast_input)?,
    )?;
    let rich_navigation_expected: serde_json::Value = serde_json::from_str(
        &breditor_collab_feasibility::rich_navigation_fixture::exercise(&rich_ast_input)?,
    )?;
    let shared_paragraph = shared_paragraph_vector(&rich_local_input)?;
    let shared_heading = shared_heading_vector(&rich_local_input)?;
    let vector = serde_json::json!({
        "rich_ast_input": rich_ast_input,
        "rich_ast_expected": rich_ast_expected,
        "rich_actions_expected": rich_actions_expected,
        "table_axes_expected":table_axes_expected,
        "rich_features_expected":rich_features_expected,
        "rich_local_input":rich_local_input,
        "rich_local_expected":rich_local_expected,
        "rich_flow_expected":rich_flow_expected,
        "rich_paste_expected":rich_paste_expected,
        "rich_recovery_expected":rich_recovery_expected,
        "rich_clipboard_expected":rich_clipboard_expected,
        "rich_navigation_expected":rich_navigation_expected,
        "shared_paragraph":shared_paragraph,
        "shared_heading":shared_heading,
    });
    Ok(vector)
}

fn shared_paragraph_vector(input: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    use breditor_collab_feasibility::rich_replica::{
        Command, RichReplica,
        actions::{JoinTextBlocks, SplitTextBlock},
        selection::{Selection, TextPoint},
    };
    use breditor_core::{
        codec::DocumentJsonCodecV2,
        extension::{ExtensionLimits, ExtensionSet},
        identity::QualifiedName,
        schema::{CompiledSchema, SchemaId, SchemaVersion},
    };
    use serde_json::json;
    let value: serde_json::Value = serde_json::from_str(input)?;
    let id = SchemaId::new(
        QualifiedName::try_new(value["schema"]["name"].as_str().ok_or("shared schema")?)?,
        SchemaVersion::try_new(u32::try_from(
            value["schema"]["version"].as_u64().ok_or("shared schema version")?,
        )?)?,
    );
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        id,
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let caret = |block: &str, offset| {
        let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
        Selection::TextRange { anchor: point.clone(), focus: point }
    };
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    a.set_selection(Some(&caret("p", 1)))?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "right".into(),
        right_heading: None,
    })])?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    a.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "p".into(),
        right: "right".into(),
    })])?;
    b.set_selection(Some(&caret("right", 2)))?;
    b.insert_plain_text("remote🙂")?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = a.view_json()?;
    let bytes = a.updates()?;
    let frame = a.update_frame()?;
    a.redo()?;
    let redo = json!({"view":a.view_json()?,"bytes":a.updates()?,"checkpoint":a.checkpoint()?});
    a.set_selection(Some(&caret("p", 12)))?;
    a.insert_plain_text("!")?;
    let typed = json!({"view":a.view_json()?,"bytes":a.updates()?,"checkpoint":a.checkpoint()?});
    a.undo()?;
    let undo = json!({"view":a.view_json()?,"bytes":a.updates()?,"checkpoint":a.checkpoint()?});
    a.redo()?;
    let retyped = json!({"view":a.view_json()?,"bytes":a.updates()?,"checkpoint":a.checkpoint()?});
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"bytes":bytes,"frame":frame,"redo":redo,"typed":typed,"undo":undo,"retyped":retyped}),
    )
}

fn shared_heading_vector(input: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    use breditor_collab_feasibility::{
        anchor::Affinity,
        rich_replica::{
            Command, RichReplica,
            actions::{InsertText, SetHeading},
            selection::{Selection, TextPoint},
        },
    };
    use breditor_core::{
        codec::DocumentJsonCodecV2,
        extension::{ExtensionLimits, ExtensionSet},
        identity::QualifiedName,
        schema::{CompiledSchema, SchemaId, SchemaVersion},
    };
    use serde_json::json;
    let value: serde_json::Value = serde_json::from_str(input)?;
    let id = SchemaId::new(
        QualifiedName::try_new(value["schema"]["name"].as_str().ok_or("shared schema")?)?,
        SchemaVersion::try_new(u32::try_from(
            value["schema"]["version"].as_u64().ok_or("shared schema version")?,
        )?)?,
    );
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        id,
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    let point = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    a.set_pending_formats(Some(&[]))?;
    a.apply(vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) })])?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 1,
        text: "X🙂".into(),
    })])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?});
    a.redo()?;
    let redo = json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?});
    a.apply(vec![Command::SetHeading(SetHeading { block: "p".into(), level: None })])?;
    let paragraph =
        json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?});
    a.undo()?;
    let undo = json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?});
    a.redo()?;
    let retyped = json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?});
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"paragraph":paragraph,"undo":undo,"retyped":retyped}),
    )
}
