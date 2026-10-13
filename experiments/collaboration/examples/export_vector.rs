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
    let vector = serde_json::json!({
        "checkpoint": checkpoint,
        "initial": initial,
        "initial_version": initial_version,
        "anchor": anchor,
        "anchor_position": anchor_position,
        "after_redo": after_redo,
        "after_undo_all": after_undo_all,
        "remaining": a.view(),
    });
    std::fs::write(path, serde_json::to_vec_pretty(&vector)?)?;
    Ok(())
}
