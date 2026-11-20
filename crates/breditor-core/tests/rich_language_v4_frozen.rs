//! Canonical freeze of rich language V4: exact fingerprints, rule revision and capabilities,
//! plus a golden saved V4 checkpoint that every later runtime must restore byte-exactly.
//!
//! If a test here fails, V4 changed. V4 is frozen and persisted by hosts: revert the change
//! and add a V5 instead. Never update the constants in `support/rich_v4_frozen.rs`.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/rich_v4_frozen.rs"]
mod frozen;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::standard_inline_extension_v1,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use frozen::FROZEN;
use serde_json::Value;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// A V4 checkpoint saved by the frozen runtime: every slice is present in the document
/// and in retained history (see `breditor-wasm/tests/rich_v4_persistence.rs`).
const SAVED_V4_CHECKPOINT: &str = include_str!("fixtures/rich-v4-frozen-checkpoint.json");

fn compile(name: &str, version: u32, revision: u32, standard: bool) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(version)?);
    let extensions = ExtensionSet::try_new(
        if standard { vec![standard_inline_extension_v1()] } else { vec![] },
        ExtensionLimits::default(),
    )?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn standard_v4() -> Result<EditorContext> {
    Ok(EditorContext::new(
        compile("breditor-editor/standard", 4, 4, true)?,
        DocumentLimits::default(),
    ))
}

#[test]
fn v4_fingerprints_rule_revision_and_slices_are_frozen() -> Result {
    let layout = compile("example/layout", 1, 4, true)?;
    let standard = compile("breditor-editor/standard", 4, 4, true)?;
    let bare = compile("example/layout", 1, 4, false)?;
    assert_eq!(layout.fingerprint().to_string(), frozen::V4_LAYOUT_FINGERPRINT, "{FROZEN}");
    assert_eq!(standard.fingerprint().to_string(), frozen::V4_STANDARD_FINGERPRINT, "{FROZEN}");
    assert_eq!(bare.fingerprint().to_string(), frozen::V4_BARE_FINGERPRINT, "{FROZEN}");
    for schema in [&layout, &standard, &bare] {
        assert_eq!(schema.rich_content_revision(), Some(frozen::V4_RULE_REVISION), "{FROZEN}");
        // Exactly the eight frozen slices (plus V3 layout); a ninth slice is V5.
        assert!(
            schema.supports_rich_block_layout()
                && schema.supports_rich_list_numbering()
                && schema.supports_rich_text_language()
                && schema.supports_rich_image_links()
                && schema.supports_rich_details()
                && schema.supports_rich_mentions()
                && schema.supports_rich_table_captions()
                && schema.supports_rich_page_breaks()
                && schema.supports_rich_bookmarks(),
            "{FROZEN}"
        );
    }
    for (revision, expected) in [
        (1, frozen::V1_LAYOUT_FINGERPRINT),
        (2, frozen::V2_LAYOUT_FINGERPRINT),
        (3, frozen::V3_LAYOUT_FINGERPRINT),
    ] {
        let old = compile("example/layout", 1, revision, true)?;
        assert_eq!(old.fingerprint().to_string(), expected);
    }
    Ok(())
}

#[test]
fn saved_v4_checkpoint_restores_byte_exact_with_every_slice_and_history() -> Result {
    let c = standard_v4()?;
    let codec = RichSessionJsonCodec::new(c.clone());
    let saved: Value = serde_json::from_str(SAVED_V4_CHECKPOINT.trim_end())?;
    assert_eq!(saved["baseDocument"]["schemaFingerprint"], frozen::V4_STANDARD_FINGERPRINT);
    let mut owner =
        codec.decode(SAVED_V4_CHECKPOINT.trim_end()).map_err(|e| format!("{FROZEN}: {e}"))?;
    assert_eq!(codec.encode(&owner)?, SAVED_V4_CHECKPOINT.trim_end(), "{FROZEN}");
    let document =
        DocumentJsonCodecV2::new(c.schema().clone()).encode(owner.state().document().document())?;
    for marker in [
        "breditor/list-style",
        "breditor/text-language",
        "breditor/image-href",
        "breditor/details-open",
        "breditor/mention",
        "breditor/page-break",
        "breditor/bookmark",
        "\"#intro\"",
    ] {
        assert!(document.contains(marker), "saved V4 document lost {marker}");
    }
    // The retained history replays: undo to the base and redo back to the saved state.
    let depth = owner.undo_depth();
    assert!(depth >= 8, "every slice has its own retained step");
    for _ in 0..depth {
        owner.undo(&owner.snapshot())?;
    }
    for _ in 0..depth {
        owner.redo(&owner.snapshot())?;
    }
    assert_eq!(
        DocumentJsonCodecV2::new(c.schema().clone()).encode(owner.state().document().document())?,
        document
    );
    Ok(())
}

#[test]
fn saved_v4_checkpoint_is_refused_under_every_other_profile() -> Result {
    let input = SAVED_V4_CHECKPOINT.trim_end();
    for (name, version, revision, standard) in [
        // Same selector, other languages: the fingerprint differs.
        ("breditor-editor/standard", 4, 3, true),
        ("breditor-editor/standard", 4, 2, true),
        ("breditor-editor/standard", 4, 1, true),
        // V4 under another selector or extension set.
        ("breditor-editor/standard", 3, 4, true),
        ("breditor-editor/standard", 4, 4, false),
        ("example/layout", 1, 4, true),
        // The stock V3 identity.
        ("breditor-editor/standard", 3, 3, true),
    ] {
        let c = EditorContext::new(
            compile(name, version, revision, standard)?,
            DocumentLimits::default(),
        );
        assert!(
            RichSessionJsonCodec::new(c).decode(input).is_err(),
            "{name}@{version} rich {revision} accepted a V4 checkpoint"
        );
    }
    // A forged fingerprint is refused before replay.
    let forged = input.replace(frozen::V4_STANDARD_FINGERPRINT, frozen::V3_LAYOUT_FINGERPRINT);
    assert_ne!(forged, input);
    assert!(RichSessionJsonCodec::new(standard_v4()?).decode(&forged).is_err());
    Ok(())
}
