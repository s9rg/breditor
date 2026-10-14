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
    let vector = serde_json::json!({
        "checkpoint": checkpoint,
        "initial": initial,
        "initial_version": initial_version,
        "anchor": anchor,
        "anchor_position": anchor_position,
        "after_redo": after_redo,
        "after_undo_all": after_undo_all,
        "remaining": a.view(),
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
    });
    std::fs::write(path, serde_json::to_vec_pretty(&vector)?)?;
    Ok(())
}
