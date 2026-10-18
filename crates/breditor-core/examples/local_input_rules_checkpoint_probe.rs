//! Fixture-only local journals for proof that earlier Wasm readers need no new rule protocol.
#[path = "../tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
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
fn checkpoint(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
fn main() -> Result {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(
            QualifiedName::try_new("example/input-rules-compatibility")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let bootstrap = json!({"format":"breditor/profile-bootstrap","formatVersion":8,"schema":{"name":"example/input-rules-compatibility","version":1},"extensions":[]}).to_string();
    let mut trials: Vec<Value> = vec![];
    for natural in [false, true] {
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
            let raw = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules-compatibility","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root}).to_string();
            let document = RichDocument::try_admit(
                context.schema(),
                DocumentJsonCodecV2::new(context.schema().clone()).decode(&raw)?,
                context.limits(),
            )?;
            let p = RichTextPoint::new(
                BlockId::try_new("body")?,
                TextOffset::try_new(source.encode_utf16().count() as u64)?,
                Affinity::After,
            );
            let mut owner = RichLocalSession::try_new(
                context.clone(),
                document,
                Some(RichSelectionKind::TextRange { anchor: p.clone(), focus: p }),
                HistoryCapacity::default(),
            )?;
            if natural {
                owner.enable_typing_history(&owner.snapshot())?;
            }
            owner.apply_markdown_input_rule(&owner.snapshot(), trigger, "rule")?;
            let saved = checkpoint(&context, &owner)?;
            let mut history = vec![];
            for command in ["undo", "redo", "undo", "redo"] {
                if command == "undo" {
                    owner.undo(&owner.snapshot())?;
                } else {
                    owner.redo(&owner.snapshot())?;
                }
                history.push(json!({"command":command,"checkpoint":checkpoint(&context,&owner)?}));
            }
            trials.push(
                json!({"natural":natural,"source":source,"checkpoint":saved,"history":history}),
            );
        }
    }
    println!(
        "{}",
        json!({"format":"breditor/input-rules-native-local-checkpoints","formatVersion":1,"bootstrap":bootstrap,"trials":trials})
    );
    Ok(())
}
