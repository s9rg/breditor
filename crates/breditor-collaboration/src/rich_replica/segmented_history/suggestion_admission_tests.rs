//! A generation-aware owner must still accept real native proposals without flattening history.
use super::super::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
    DocumentSuggestionScope, actions::InsertText,
};
use super::tests::{Result, cold, enable, equal, insert, seal, setup};
use breditor_core::rich_content::review::ReviewPrincipalId;

#[test]
fn segmented_acceptance_prepares_and_commits_on_all_144_native_history_families() -> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for scope in 0..3 {
                for mask in 0..8 {
                    let (profile, mut owner) = setup(version, standard, scope, mask)?;
                    insert(&mut owner, "retained ")?;
                    insert(&mut owner, "saved redo ")?;
                    assert!(owner.undo()?);
                    let packet = owner.capture_document_suggestion_guarded(
                        &owner.observe()?,
                        "Accept after selecting generations",
                        ReviewPrincipalId::try_new("alice")?,
                        "0",
                        DocumentSuggestionDraft {
                            scope: DocumentSuggestionScope::Commands,
                            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(
                                InsertText {
                                    block: "p".into(),
                                    offset: 0,
                                    text: "accepted ".into(),
                                },
                            )]),
                        },
                    )?;
                    let mut oracle = owner.staged()?;
                    enable(&mut owner)?;
                    let before = owner.segmented_checkpoint()?;
                    let DocumentSuggestionPreparation::Ready(preview) =
                        owner.prepare_document_suggestion_guarded(&owner.observe()?, &packet)?
                    else {
                        return Err("expected native preview".into());
                    };
                    let prepared = owner.prepare_document_suggestion_effect(&preview)?;
                    assert_eq!(owner.segmented_checkpoint()?, before);
                    assert!(prepared.document_json().contains("accepted "));
                    let DocumentSuggestionPreparation::Ready(preview) =
                        oracle.prepare_document_suggestion_guarded(&oracle.observe()?, &packet)?
                    else {
                        return Err("expected original native oracle".into());
                    };
                    let original = oracle.prepare_document_suggestion_effect(&preview)?;
                    assert_eq!(prepared.effect(), original.effect());
                    assert_eq!(prepared.writer_group_json(), original.writer_group_json());
                    assert_eq!(prepared.update_frame()?, original.update_frame()?);
                    owner.commit_document_suggestion_effect(prepared)?;
                    oracle.commit_document_suggestion_effect(original)?;
                    equal(&owner, &oracle)?;
                    seal(&mut owner, "accepted-seal")?;
                    owner = cold(&profile, &owner)?;
                    for redo in [false, true, false, false, true, true] {
                        assert!(if redo { owner.redo()? } else { owner.undo()? });
                        assert!(if redo { oracle.redo()? } else { oracle.undo()? });
                        equal(&owner, &oracle)?;
                        owner = cold(&profile, &owner)?;
                    }
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 144);
    Ok(())
}
