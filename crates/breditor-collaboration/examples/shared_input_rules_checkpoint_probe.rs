//! Shared fixture journals exercise earlier application Wasm without adding a new command family.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        ReviewedHistoryIdentity, RichReplica, SharedObservation, SharedRichProfile,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(if owner.document_selection_enabled() {
        owner.observe_document()?
    } else {
        owner.observe()?
    })
}
fn checkpoint(owner: &RichReplica) -> Result<String> {
    Ok(if owner.search_history_enabled() {
        owner.search_checkpoint()?
    } else if owner.reviewed_history_enabled() {
        owner.reviewed_checkpoint()?
    } else if owner.document_selection_enabled() {
        if owner.typing_history_enabled() {
            owner.document_typing_checkpoint()?
        } else {
            owner.document_checkpoint()?
        }
    } else if owner.general_ranges_enabled() {
        if owner.typing_history_enabled() {
            owner.general_typing_checkpoint()?
        } else {
            owner.general_checkpoint()?
        }
    } else if owner.typing_history_enabled() {
        owner.typing_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}
fn main() -> Result {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/input-rules-compatibility","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let mut trials: Vec<Value> = vec![];
    for (scope, natural, reviewed, search) in [
        (0, false, false, false),
        (0, true, false, false),
        (1, false, false, false),
        (1, true, false, false),
        (2, false, false, false),
        (2, true, false, false),
        (0, false, true, false),
        (1, true, true, true),
        (2, false, true, true),
    ] {
        for (source, trigger) in [
            ("### ", " "),
            ("7. ", " "),
            ("> ", " "),
            ("[x] ", " "),
            ("```rust ", " "),
            ("--- ", " "),
            ("**猫🙂**", "*"),
            ("~~猫🙂~~", "~"),
        ] {
            let mut root = fixture::root();
            root["children"]
                .as_array_mut()
                .ok_or("missing flow")?
                .insert(0, fixture::paragraph("body", source));
            let raw = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules-compatibility","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
            let mut owner = profile.create(&raw, "101".into())?;
            if scope == 1 {
                owner.enable_general_ranges_guarded(&observed(&owner)?)?;
            } else if scope == 2 {
                owner.enable_document_selection_guarded(&observed(&owner)?)?;
            }
            if natural {
                owner.enable_typing_history_guarded(&observed(&owner)?)?;
            }
            if reviewed {
                owner.enable_reviewed_history_guarded(
                    &observed(&owner)?,
                    ReviewedHistoryIdentity {
                        binding: "a".repeat(64),
                        principal: breditor_core::rich_content::review::ReviewPrincipalId::try_new(
                            "alice",
                        )?,
                        effect_writer: "303".into(),
                    },
                )?;
            }
            if search {
                owner.enable_search_history_guarded(&observed(&owner)?)?;
            }
            let p = TextPoint {
                block: "body".into(),
                offset: u32::try_from(source.encode_utf16().count())?,
                affinity: Affinity::After,
            };
            owner.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
            owner.apply_markdown_input_rule_guarded(&observed(&owner)?, trigger, "rule")?;
            let saved = checkpoint(&owner)?;
            let mut history = vec![];
            for command in ["undo", "redo", "undo", "redo"] {
                if command == "undo" {
                    owner.undo()?;
                } else {
                    owner.redo()?;
                }
                history.push(json!({"command":command,"checkpoint":checkpoint(&owner)?}));
            }
            trials.push(json!({"scope":scope,"natural":natural,"reviewed":reviewed,"search":search,"source":source,"checkpoint":saved,"history":history}));
        }
    }
    println!(
        "{}",
        json!({"format":"breditor/input-rules-native-shared-checkpoints","formatVersion":1,"configuration":configuration,"trials":trials})
    );
    Ok(())
}
