//! Emit fixture-only shared histories for comparison with an actual earlier Wasm runtime.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        RichReplica, SharedRichProfile,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::BlockId,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn saved(owner: &RichReplica) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        owner.typing_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn main() -> Result {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,
        "schema":{"name":"example/shared-general-range","version":1},"extensions":[]})
    .to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let source = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/shared-general-range","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":fixture::root()})
    .to_string();
    let inserted: TextFragment =
        TextRun::try_new("X🙂", FormatSet::try_from_formats(vec![])?)?.into();
    let mut trials: Vec<Value> = vec![];
    for (first, x, last, y) in
        [("p-0-0", 1, "p-1-1", 3), ("z-intro", 1, "caption", 1), ("z-intro", 1, "nested-text", 2)]
    {
        for backwards in [false, true] {
            for natural in [false, true] {
                let mut owner = profile.create(&source, "101".into())?;
                if natural {
                    owner.enable_typing_history_guarded(&owner.observe()?)?;
                }
                let mut anchor = point(first, x);
                let mut focus = point(last, y);
                if backwards {
                    std::mem::swap(&mut anchor, &mut focus);
                }
                owner.set_selection(Some(&Selection::TextRange { anchor, focus }))?;
                let plan =
                    owner.plan_general_selection_text_guarded(&owner.observe()?, &inserted)?;
                let empty = (0..plan.empty_blocks().len())
                    .map(|index| {
                        Ok(BlockId::try_new(format!(
                            "shared-proof-{}-floor-{index}",
                            trials.len()
                        ))?)
                    })
                    .collect::<Result<Vec<_>>>()?;
                owner.replace_general_selection_text_guarded(
                    &owner.observe()?,
                    &inserted,
                    &empty,
                )?;
                let checkpoint = saved(&owner)?;
                let mut history = vec![];
                for command in ["undo", "redo", "undo", "redo"] {
                    if command == "undo" {
                        owner.undo()?;
                    } else {
                        owner.redo()?;
                    }
                    history.push(json!({"command":command,"checkpoint":saved(&owner)?}));
                }
                trials.push(json!({"first":first,"last":last,"backwards":backwards,"natural":natural,"checkpoint":checkpoint,"history":history}));
            }
        }
    }
    println!(
        "{}",
        json!({"format":"breditor/shared-general-range-checkpoint-probe","formatVersion":1,"configuration":configuration,"trials":trials})
    );
    Ok(())
}
