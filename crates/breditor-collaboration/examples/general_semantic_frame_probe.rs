//! Fixture-only proof: new local replay records, original peer-frame semantics.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{DeleteBlock, SplitTextBlock},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::BlockId,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Case {
    configuration: String,
    owner: RichReplica,
    anchor: TextPoint,
    focus: TextPoint,
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn nodes(n: &Value) -> usize {
    1 + n.get("children").and_then(Value::as_array).map_or(0, |c| c.iter().map(nodes).sum())
}
fn find<'a>(n: &'a Value, id: &str) -> Option<&'a Value> {
    if n["properties"]["breditor/block-id"] == id {
        return Some(n);
    }
    n.get("children")?.as_array()?.iter().find_map(|c| find(c, id))
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.general_typing_checkpoint()?
    } else {
        a.general_checkpoint()?
    })
}
fn case(kind: &str) -> Result<Case> {
    let root = fixture::root();
    let schema = json!({"name":"example/general-semantic-frames","version":1});
    let limits =
        if kind == "cells_at_node_limit" { json!({"maxNodes":nodes(&root)}) } else { json!({}) };
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":schema,"extensions":[],"limits":limits}).to_string();
    let p = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let source=json!({"format":"breditor/document","formatVersion":2,"schema":schema,"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut owner = p.create(&source, "101".into())?;
    let (anchor, focus) = match kind {
        "cells_at_node_limit" => (point("p-0-0", 1), point("p-1-1", 3)),
        "caption" => (point("z-intro", 1), point("caption", 1)),
        "generated_head" => {
            owner.apply(vec![Command::DeleteBlock(DeleteBlock { block: "p-0-1".into() })])?;
            let raw: Value = serde_json::from_str(owner.document_json())?;
            let head=find(&raw["root"],"cell-0-1").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("head")?.to_owned();
            owner.set_selection(Some(&Selection::TextRange {
                anchor: point(&head, 0),
                focus: point(&head, 0),
            }))?;
            owner.insert_plain_text("ab")?;
            owner.apply(vec![Command::SplitTextBlock(SplitTextBlock {
                block: head,
                offset: 1,
                right: "retained-right".into(),
                right_heading: None,
            })])?;
            (point("p-0-0", 1), point("retained-right", 1))
        }
        _ => return Err("fixture case".into()),
    };
    Ok(Case { configuration, owner, anchor, focus })
}
fn trial(kind: &str, natural: bool, backwards: bool) -> Result<Value> {
    trial_with_joining(kind, natural, backwards, false)
}
fn trial_with_joining(kind: &str, natural: bool, backwards: bool, joined: bool) -> Result<Value> {
    let Case { configuration, mut owner, mut anchor, mut focus } = case(kind)?;
    if natural {
        owner.enable_typing_history_guarded(&owner.observe()?)?;
    }
    owner.enable_general_ranges_guarded(&owner.observe()?)?;
    if backwards {
        std::mem::swap(&mut anchor, &mut focus);
    }
    owner.set_selection(Some(&Selection::TextRange { anchor, focus }))?;
    let initial_frame = owner.update_frame()?;
    let inserted: TextFragment =
        TextRun::try_new("X🙂", FormatSet::try_from_formats(vec![])?)?.into();
    let plan = owner.plan_general_selection_text_guarded(&owner.observe()?, &inserted)?;
    let empty = (0..plan.empty_blocks().len())
        .map(|i| Ok(BlockId::try_new(format!("semantic-proof-floor-{i}"))?))
        .collect::<Result<Vec<_>>>()?;
    if joined {
        owner.replace_general_typing_text_guarded(&owner.observe()?, "X🙂", &empty, 1000)?;
        owner.insert_typing_text_guarded(&owner.observe()?, "Y", 1050)?;
    } else {
        owner.replace_general_selection_text_guarded(&owner.observe()?, &inserted, &empty)?;
    }
    let checkpoint = saved(&owner)?;
    let frame = owner.update_frame()?;
    let document = owner.document_json().to_owned();
    let mut history = vec![];
    for command in ["undo", "redo", "undo", "redo"] {
        if command == "undo" {
            owner.undo()?;
        } else {
            owner.redo()?;
        }
        history.push(json!({"command":command,"frame":owner.update_frame()?,"document":owner.document_json(),"checkpoint":saved(&owner)?}));
    }
    Ok(
        json!({"case":kind,"natural":natural,"backwards":backwards,"joined":joined,"configuration":configuration,"initialFrame":initial_frame,"frame":frame,"document":document,"checkpoint":checkpoint,"history":history}),
    )
}
fn main() -> Result {
    let mut trials = vec![];
    for kind in ["cells_at_node_limit", "generated_head", "caption"] {
        for natural in [false, true] {
            for backwards in [false, true] {
                trials.push(trial(kind, natural, backwards)?);
            }
        }
    }
    let mut joined_trials = vec![];
    for kind in ["cells_at_node_limit", "generated_head", "caption"] {
        for backwards in [false, true] {
            joined_trials.push(trial_with_joining(kind, true, backwards, true)?);
        }
    }
    println!(
        "{}",
        json!({"format":"breditor/general-semantic-frame-probe","formatVersion":1,"trials":trials,"joinedTrials":joined_trials})
    );
    Ok(())
}
