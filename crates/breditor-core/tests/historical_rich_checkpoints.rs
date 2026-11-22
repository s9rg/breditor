//! Historical checkpoints produced before V4, with a nonempty Undo and Redo stack.
#![cfg(feature = "experimental-rich-content")]

use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

// Captured with the core from commit 79ba07cb2ab4fe5b056bf96bf755175531987c7e.
const HISTORICAL: [(u32, &str); 3] = [
    (1, include_str!("fixtures/pre-v4/rich-v1-history.json")),
    (2, include_str!("fixtures/pre-v4/rich-v2-history.json")),
    (3, include_str!("fixtures/pre-v4/rich-v3-history.json")),
];

fn context(language: u32) -> TestResult<EditorContext> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/rich-recovery")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = match language {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("unsupported fixture language".into()),
    };
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}

#[test]
fn historical_checkpoint_replays_its_original_undo_and_redo() -> TestResult {
    for (language, stored) in HISTORICAL {
        let editor_context = context(language)?;
        let documents = DocumentJsonCodecV2::new(editor_context.schema().clone());
        let checkpoints = RichSessionJsonCodec::new(editor_context);
        let stored = stored.trim_end();
        let mut restored = checkpoints.decode(stored)?;
        assert_eq!(checkpoints.encode(&restored)?, stored, "language {language}");
        assert_eq!((restored.undo_depth(), restored.redo_depth()), (4, 1));

        let view = |owner: &breditor_core::rich_content::RichLocalSession| {
            documents.encode(owner.state().document().document())
        };
        let retained = view(&restored)?;
        assert!(retained.contains("Caption 🙂"));
        assert!(!retained.contains("\"breditor/block-id\":\"right\""));

        restored.redo(&restored.snapshot())?;
        assert_eq!((restored.undo_depth(), restored.redo_depth()), (5, 0));
        let split = view(&restored)?;
        assert!(split.contains("\"breditor/block-id\":\"right\""));
        assert!(split.contains("Caption 🙂"));
        restored.undo(&restored.snapshot())?;
        assert_eq!(view(&restored)?, retained);

        for _ in 0..4 {
            restored.undo(&restored.snapshot())?;
        }
        assert_eq!((restored.undo_depth(), restored.redo_depth()), (0, 5));
        let document = serde_json::from_str::<serde_json::Value>(&view(&restored)?)?;
        let checkpoint = serde_json::from_str::<serde_json::Value>(stored)?;
        assert_eq!(document, checkpoint["baseDocument"], "language {language}");

        for _ in 0..5 {
            restored.redo(&restored.snapshot())?;
        }
        assert_eq!(view(&restored)?, split, "language {language}");
    }
    Ok(())
}

#[test]
fn historical_checkpoint_rejects_the_other_language_profiles() -> TestResult {
    for (language, stored) in HISTORICAL {
        for candidate in (1..=4).filter(|candidate| *candidate != language) {
            let checkpoints = RichSessionJsonCodec::new(context(candidate)?);
            assert!(
                checkpoints.decode(stored.trim_end()).is_err(),
                "language {candidate} accepted a saved language {language} checkpoint",
            );
        }
    }
    Ok(())
}
