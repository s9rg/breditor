//! Native shared writing reads preserve exact observations, causal state and history.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedObservation, SharedRichProfile, actions::InsertText,
};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn setup(version: u8) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/writing","version":1},"extensions":[]}).to_string();
    let profile = match version {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/writing","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/heading","entityId":null,"properties":{"breditor/block-id":"body","breditor/level":2},"children":[{"kind":"text","text":"Hello","formats":[]}]}]}}).to_string();
    let owner = profile.create(&input, "101".into())?;
    Ok((profile, owner))
}
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(if owner.document_selection_enabled() {
        owner.observe_document()?
    } else {
        owner.observe()?
    })
}
fn saved(owner: &RichReplica) -> Result<String> {
    Ok(if owner.document_selection_enabled() {
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

#[test]
fn all_grammars_scopes_and_history_modes_read_without_invalidating_readonly_redo_or_observations()
-> Result {
    for version in 1..=3 {
        for scope in 0..3 {
            for natural in [false, true] {
                let (profile, mut owner) = setup(version)?;
                if scope == 1 {
                    owner.enable_general_ranges_guarded(&observed(&owner)?)?;
                }
                if scope == 2 {
                    owner.enable_document_selection_guarded(&observed(&owner)?)?;
                }
                if natural {
                    owner.enable_typing_history_guarded(&observed(&owner)?)?;
                }
                owner.apply(vec![Command::InsertText(InsertText {
                    block: "body".into(),
                    offset: 0,
                    text: "X".into(),
                })])?;
                owner.undo()?;
                if scope == 2 {
                    owner.select_document_guarded(&observed(&owner)?)?;
                }
                owner.set_read_only_guarded(&observed(&owner)?, true)?;
                let source = observed(&owner)?;
                let before =
                    (saved(&owner)?, owner.causal_version(), source.view_json().to_owned());
                let retained = owner.writing_tools_guarded(&source)?;
                assert_eq!(retained.counts().graphemes(), 5);
                assert_eq!(retained.outline()[0].label(), "Hello");
                for _ in 0..3 {
                    assert_eq!(owner.writing_tools_guarded(&source)?, retained);
                }
                assert_eq!(
                    (
                        saved(&owner)?,
                        owner.causal_version(),
                        observed(&owner)?.view_json().to_owned()
                    ),
                    before
                );
                owner.set_read_only_guarded(&source, false)?;
                let bytes = saved(&owner)?;
                let mut twin = if scope == 2 {
                    if natural {
                        profile.restore_document_typing("room", &bytes)?
                    } else {
                        profile.restore_document("room", &bytes)?
                    }
                } else if scope == 1 {
                    if natural {
                        profile.restore_general_typing("room", &bytes)?
                    } else {
                        profile.restore_general("room", &bytes)?
                    }
                } else if natural {
                    profile.restore_typing("room", &bytes)?
                } else {
                    profile.restore("room", &bytes)?
                };
                assert_eq!(saved(&twin)?, bytes);
                for redo in [true, false, true, false] {
                    if redo {
                        owner.redo()?;
                        twin.redo()?;
                    } else {
                        owner.undo()?;
                        twin.undo()?;
                    }
                    assert_eq!(saved(&owner)?, saved(&twin)?);
                }
                assert_eq!(retained.outline()[0].label(), "Hello");
            }
        }
    }
    Ok(())
}
#[test]
fn foreign_and_stale_reads_refuse_while_remote_publications_recompute_counts_without_authorship()
-> Result {
    let (profile, mut owner) = setup(3)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
    let source = observed(&owner)?;
    let retained = owner.writing_tools_guarded(&source)?;
    let before = saved(&owner)?;
    assert!(owner.writing_tools_guarded(&observed(&peer)?).is_err());
    assert_eq!(saved(&owner)?, before);
    peer.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 5,
        text: " peer".into(),
    })])?;
    owner.receive_frame(&peer.update_frame()?)?;
    let before = saved(&owner)?;
    assert!(owner.writing_tools_guarded(&source).is_err());
    assert_eq!(saved(&owner)?, before);
    let fresh = owner.writing_tools_guarded(&observed(&owner)?)?;
    assert_eq!((fresh.counts().words(), fresh.counts().graphemes()), (2, 10));
    assert_eq!(fresh, peer.writing_tools_guarded(&observed(&peer)?)?);
    assert_eq!(owner.undo_count(), 0);
    assert_eq!(owner.redo_count(), 0);
    assert_eq!(retained.counts().graphemes(), 5);
    assert_eq!(retained.outline()[0].label(), "Hello");
    Ok(())
}
