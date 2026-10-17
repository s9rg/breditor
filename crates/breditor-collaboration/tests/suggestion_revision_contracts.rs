//! Immutable native revision relations, exact source proofs and pure recovery under every policy.
use breditor_collaboration::rich_replica::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
    DocumentSuggestionRevisionSource, DocumentSuggestionScope, RichReplica, SharedRichProfile,
    actions::InsertText,
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-revisions","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let source = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/suggestion-revisions","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root});
    let a = p.create(&source.to_string(), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn insert(text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })
}
fn draft(text: &str) -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![insert(text)]),
    }
}
fn original(a: &RichReplica) -> Result<String> {
    Ok(a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Original",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        draft("Original "),
    )?)
}
fn save(a: &RichReplica, scope: u8, typing: bool) -> Result<String> {
    Ok(match (scope, typing) {
        (0, false) => a.checkpoint()?,
        (0, true) => a.typing_checkpoint()?,
        (1, false) => a.general_checkpoint()?,
        (1, true) => a.general_typing_checkpoint()?,
        (2, false) => a.document_checkpoint()?,
        (2, true) => a.document_typing_checkpoint()?,
        _ => return Err("test policy".into()),
    })
}
fn restore(p: &SharedRichProfile, saved: &str, scope: u8, typing: bool) -> Result<RichReplica> {
    Ok(match (scope, typing) {
        (0, false) => p.restore("room", saved)?,
        (0, true) => p.restore_typing("room", saved)?,
        (1, false) => p.restore_general("room", saved)?,
        (1, true) => p.restore_general_typing("room", saved)?,
        (2, false) => p.restore_document("room", saved)?,
        (2, true) => p.restore_document_typing("room", saved)?,
        _ => return Err("test policy".into()),
    })
}
#[test]
fn revisions_remain_pure_immutable_v1_replacements_in_all_six_readonly_history_policies() -> Result
{
    for scope in 0..=2 {
        for typing in [false, true] {
            let (p, mut a, _) = setup()?;
            if scope == 1 {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if scope == 2 {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![insert("Retained Redo ")])?;
            a.undo()?;
            let parent = original(&a)?;
            a.set_read_only_guarded(&a.observe()?, true)?;
            let exact = (save(&a, scope, typing)?, a.update_frame()?, a.view_json()?);
            let revision = a.capture_document_suggestion_revision_guarded(
                &a.observe()?,
                &parent,
                "Revised 日本 <literal>",
                "18446744073709551615",
                draft("Replacement 🙂 "),
            )?;
            let info = a.read_document_suggestion_revision(&parent, &revision)?;
            assert!(
                a.read_document_suggestion(&revision).is_err(),
                "a revision cannot be interpreted as an ordinary V1 proposal"
            );
            assert_eq!(info.previous_suggestion_id, a.read_document_suggestion(&parent)?.id);
            assert_eq!(info.suggestion.author.as_str(), "alice");
            let child = a.document_suggestion_revision_packet(&parent, &revision)?;
            assert_eq!(serde_json::from_str::<Value>(&child)?["data"]["formatVersion"], 1);
            let DocumentSuggestionPreparation::Ready(preview) =
                a.prepare_document_suggestion_guarded(&a.observe()?, &child)?
            else {
                return Err("ready child".into());
            };
            assert!(preview.document_json().contains("Replacement 🙂 "));
            assert!(!a.document_json().contains("Replacement 🙂 "));
            assert!(matches!(
                a.verify_document_suggestion_revision(&parent, &revision)?,
                DocumentSuggestionRevisionSource::Verified { .. }
            ));
            assert_eq!((save(&a, scope, typing)?, a.update_frame()?, a.view_json()?), exact);
            let b = restore(&p, &exact.0, scope, typing)?;
            assert_eq!(b.read_document_suggestion_revision(&parent, &revision)?, info);
            a.set_read_only_guarded(&a.observe()?, false)?;
            let mut b = restore(&p, &save(&a, scope, typing)?, scope, typing)?;
            a.redo()?;
            b.redo()?;
            assert_eq!(save(&a, scope, typing)?, save(&b, scope, typing)?);
            let next = a.capture_document_suggestion_revision_guarded(
                &a.observe()?,
                &child,
                "Third",
                "2",
                draft("Third "),
            )?;
            assert_eq!(
                a.read_document_suggestion_revision(&child, &next)?.previous_suggestion_id,
                info.suggestion.id
            );
        }
    }
    Ok(())
}
#[test]
fn missing_child_or_parent_sources_stay_explicit_until_document_catchup() -> Result {
    let (_, mut a, mut b) = setup()?;
    let parent = original(&a)?;
    a.apply(vec![insert("Offline source ")])?;
    let revision = a.capture_document_suggestion_revision_guarded(
        &a.observe()?,
        &parent,
        "Revised",
        "1",
        draft("New "),
    )?;
    let exact = b.checkpoint()?;
    assert!(
        matches!(b.verify_document_suggestion_revision(&parent,&revision)?,DocumentSuggestionRevisionSource::Pending { missing } if missing.len()==1)
    );
    assert_eq!(b.checkpoint()?, exact);
    b.receive_frame(&a.update_frame()?)?;
    assert!(matches!(
        b.verify_document_suggestion_revision(&parent, &revision)?,
        DocumentSuggestionRevisionSource::Verified { .. }
    ));
    let future = original(&a)?;
    let (_, _, c) = setup()?;
    assert!(
        c.capture_document_suggestion_revision_guarded(
            &c.observe()?,
            &future,
            "Unavailable",
            "3",
            draft("New ")
        )
        .is_err()
    );
    Ok(())
}
#[test]
fn same_packet_noop_stale_unknown_fields_and_missing_predecessors_refuse_without_writes() -> Result
{
    let (_, mut a, _) = setup()?;
    let parent = original(&a)?;
    let observed = a.observe()?;
    assert!(
        a.capture_document_suggestion_revision_guarded(
            &observed,
            &parent,
            "Original",
            "0",
            draft("Original ")
        )
        .is_err()
    );
    a.apply(vec![insert("Changed source ")])?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(
        a.capture_document_suggestion_revision_guarded(
            &observed,
            "not-json",
            "Revised",
            "1",
            draft("New ")
        )
        .is_err()
    );
    let revision = a.capture_document_suggestion_revision_guarded(
        &a.observe()?,
        &parent,
        "Revised",
        "1",
        draft("New "),
    )?;
    let mut value: Value = serde_json::from_str(&revision)?;
    value["data"]["accepted"] = json!(true);
    assert!(a.read_document_suggestion_revision(&parent, &value.to_string()).is_err());
    assert!(a.read_document_suggestion_revision("missing", &revision).is_err());
    assert!(
        a.read_document_suggestion_revision(&parent, &"x".repeat(2 * 1024 * 1024 + 4097)).is_err()
    );
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
