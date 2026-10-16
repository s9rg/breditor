//! Shared external admission is pure in every history/selection family, including read-only.
use breditor_collaboration::rich_replica::{RichReplica, SharedRichProfile};
use breditor_core::rich_content::RichClipboardKind;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn owner() -> Result<RichReplica> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/interchange","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/interchange","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    Ok(profile.create(&input.to_string(), "101".into())?)
}
fn root() -> Value {
    json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"breditor-clipboard"},"children":[{
        "kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"source"},"children":[
            {"kind":"text","text":"Office 🙂 日本","formats":[{"type":"breditor-inline/italic","properties":{}}]}
        ]
    }]})
}
#[test]
fn interchange_admission_changes_no_checkpoint_frame_or_observation() -> Result {
    for document in [false, true] {
        for typing in [false, true] {
            let mut a = owner()?;
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            if document {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            let observation = if document { a.observe_document()? } else { a.observe()? };
            a.set_read_only_guarded(&observation, true)?;
            let checkpoint = |a: &RichReplica| -> Result<String> {
                Ok(match (document, typing) {
                    (true, true) => a.document_typing_checkpoint()?,
                    (true, false) => a.document_checkpoint()?,
                    (false, true) => a.typing_checkpoint()?,
                    (false, false) => a.checkpoint()?,
                })
            };
            let before = (checkpoint(&a)?, a.update_frame()?);
            let transfer: Value = serde_json::from_str(
                &a.admit_clipboard_root(RichClipboardKind::Text, &root().to_string())?,
            )?;
            let structured = transfer["structuredJson"].as_str().ok_or("structured")?;
            assert_eq!(
                serde_json::from_str::<Value>(&a.validate_clipboard(structured)?)?,
                transfer
            );
            assert_eq!(transfer["plainText"], "Office 🙂 日本");
            assert!(a.admit_clipboard_root(RichClipboardKind::Grid, &root().to_string()).is_err());
            assert!(a.validate_clipboard("{}").is_err());
            assert_eq!((checkpoint(&a)?, a.update_frame()?), before);
        }
    }
    Ok(())
}
