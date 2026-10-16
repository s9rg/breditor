//! Emit fixture-only native checkpoints to prove recovery in an actual earlier Wasm binary.
#[path = "../tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalSession, RichSelectionKind, RichTextPoint,
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn checkpoint(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
fn main() -> Result {
    let schema_id =
        SchemaId::new(QualifiedName::try_new("example/general-range")?, SchemaVersion::try_new(1)?);
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        schema_id,
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let bootstrap=json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/general-range","version":1},"extensions":[]}).to_string();
    let raw=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-range","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&raw)?,
        context.limits(),
    )?;
    let inserted: TextFragment =
        TextRun::try_new("X🙂", FormatSet::try_from_formats(vec![])?)?.into();
    let mut trials: Vec<Value> = vec![];
    for (first, start, last, end) in
        [("p-0-0", 1, "p-1-1", 3), ("z-intro", 1, "caption", 1), ("z-intro", 1, "nested-text", 2)]
    {
        for backwards in [false, true] {
            for natural in [false, true] {
                let mut anchor = point(first, start)?;
                let mut focus = point(last, end)?;
                if backwards {
                    std::mem::swap(&mut anchor, &mut focus);
                }
                let mut owner = RichLocalSession::try_new(
                    context.clone(),
                    document.clone(),
                    Some(RichSelectionKind::TextRange { anchor, focus }),
                    HistoryCapacity::default(),
                )?;
                if natural {
                    owner.enable_typing_history(&owner.snapshot())?;
                }
                let plan = owner.plan_general_selection_text(&owner.snapshot(), &inserted)?;
                let ids = (0..plan.empty_blocks().len())
                    .map(|index| {
                        Ok(BlockId::try_new(format!("proof-{}-floor-{index}", trials.len()))?)
                    })
                    .collect::<Result<Vec<_>>>()?;
                owner.replace_general_selection_text(&owner.snapshot(), &inserted, &ids)?;
                let saved = checkpoint(&context, &owner)?;
                let mut history = vec![];
                for command in ["undo", "redo", "undo", "redo"] {
                    if command == "undo" {
                        owner.undo(&owner.snapshot())?;
                    } else {
                        owner.redo(&owner.snapshot())?;
                    }
                    history
                        .push(json!({"command":command,"checkpoint":checkpoint(&context,&owner)?}));
                }
                trials.push(json!({"natural":natural,"backwards":backwards,"first":first,"last":last,"checkpoint":saved,"history":history}));
            }
        }
    }
    println!(
        "{}",
        json!({"format":"breditor/general-range-checkpoint-probe","formatVersion":1,"bootstrap":bootstrap,"trials":trials})
    );
    Ok(())
}
