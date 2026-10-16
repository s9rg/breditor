//! Deterministic projection-work guards, with immutable checks retained before every cache hit.
use super::*;
use crate::rich_replica::{SharedRichProfile, actions::InsertText};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn owner(version: u32) -> Result<RichReplica> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/projection-cache","version":1},"extensions":[]}).to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_configuration_json(&config)?
    } else {
        SharedRichProfile::from_configuration_json_v2(&config)?
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let doc = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/projection-cache","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok(profile.create(&doc, "101".into())?)
}

#[test]
fn unchanged_committed_projection_is_reused_without_changing_observation_or_journal() -> Result {
    for version in [1, 2] {
        let mut a = owner(version)?;
        let count = a.projection_cache.admissions();
        assert!(count > 0);
        assert!(a.projection_cache.is_current(&a.doc, &a.token));
        let observation = a.observe()?;
        let checkpoint = a.checkpoint()?;
        for _ in 0..10 {
            a.refresh_document()?;
        }
        assert_eq!(a.projection_cache.admissions(), count);
        assert_eq!(a.checkpoint()?, checkpoint);
        assert_eq!(a.view_json()?, observation.view_json());
        a.check(&observation)?;
    }
    Ok(())
}

#[test]
fn changed_causal_content_must_be_materialized_and_admitted_again() -> Result {
    for version in [1, 2] {
        let mut a = owner(version)?;
        let count = a.projection_cache.admissions();
        let before = a.canonical.clone();
        let stamp = Stamp::next(&a.doc)?;
        let command =
            Command::InsertText(InsertText { block: "p".into(), offset: 1, text: "X".into() });
        command.prepare(&a.doc)?;
        command.apply(&a.doc, &a.codec, &a.document, stamp, 0)?;
        a.doc.commit();
        assert!(!a.projection_cache.is_current(&a.doc, &a.token));
        a.refresh_document()?;
        assert_ne!(a.canonical, before);
        assert!(a.canonical.contains('X'));
        assert_eq!(a.projection_cache.admissions(), count + 1);
        a.refresh_document()?;
        assert_eq!(a.projection_cache.admissions(), count + 1);
    }
    Ok(())
}

#[test]
fn positive_projection_never_bypasses_immutable_protocol_or_header_checks() -> Result {
    let mut model = owner(1)?;
    let before = model.canonical.clone();
    model.doc.get_map("binding").insert("model-version", "12")?;
    model.doc.commit();
    // Fault injection: even an incorrectly stamped positive cache is not binding admission.
    model.projection_cache.record(&model.doc, &model.token);
    assert!(model.projection_cache.is_current(&model.doc, &model.token));
    assert!(matches!(
        model.refresh_document(),
        Err(Error::Contract("immutable shared causal model binding"))
    ));
    assert_eq!(model.canonical, before);

    let mut header = owner(1)?;
    let before = header.canonical.clone();
    let mut wrong = header.header.clone();
    wrong["schemaFingerprint"] = "forged".into();
    header.doc.get_map("binding").insert("header", wrong.to_string())?;
    header.doc.commit();
    header.projection_cache.record(&header.doc, &header.token);
    assert!(header.projection_cache.is_current(&header.doc, &header.token));
    assert!(matches!(
        header.refresh_document(),
        Err(Error::Contract("immutable shared document binding"))
    ));
    assert_eq!(header.canonical, before);
    Ok(())
}

fn insert(offset: u32, value: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset, text: value.into() })
}
fn saved(a: &RichReplica) -> std::result::Result<String, Error> {
    if a.typing_history_enabled() { a.typing_checkpoint() } else { a.checkpoint() }
}

#[test]
fn admitted_prefix_reuse_and_fresh_replay_have_identical_exact_future_history() -> Result {
    for version in [1, 2] {
        for typing in [false, true] {
            let mut live = owner(version)?;
            if typing {
                live.enable_typing_history_guarded(&live.observe()?)?;
            }
            for index in 0..8 {
                assert!(live.apply(vec![insert(index + 1, "X")])?);
            }
            assert!(live.undo()?);
            assert!(live.redo()?);
            let mut staged = live.staged()?;
            assert!(staged.replay_projections.replay_hits() > 0);
            assert!(!staged.replay_projections.has_source());
            let mut fresh = RichReplica::from_journal_parts(
                live.codec.clone(),
                live.journal.clone(),
                live.typing.as_ref().map(|value| value.joins.clone()),
                false,
            )?;
            assert_eq!(fresh.replay_projections.replay_hits(), 0);
            assert!(!fresh.replay_projections.has_source());
            assert_eq!(saved(&live)?, saved(&fresh)?);
            assert_eq!(saved(&staged)?, saved(&fresh)?);
            for redo in [false, false, true, false, true, true] {
                assert_eq!(
                    if redo { staged.redo()? } else { staged.undo()? },
                    if redo { fresh.redo()? } else { fresh.undo()? }
                );
                assert_eq!(saved(&staged)?, saved(&fresh)?);
                assert_eq!(staged.view_json()?, fresh.view_json()?);
                assert!(!staged.replay_projections.has_source());
            }
            assert!(staged.apply(vec![insert(1, "Y")])?);
            assert!(fresh.apply(vec![insert(1, "Y")])?);
            assert_eq!(saved(&staged)?, saved(&fresh)?);
            assert_eq!(staged.document_json(), fresh.document_json());
        }
    }
    Ok(())
}

#[test]
fn late_publication_failure_does_not_cache_an_unadopted_new_payload() -> Result {
    for version in [1, 2] {
        let mut live = owner(version)?;
        assert!(live.apply(vec![insert(1, "A")])?);
        live.journal.publication = u64::MAX.to_string();
        let frozen = live.observe()?;
        let before = live.checkpoint()?;
        assert!(matches!(
            live.apply(vec![insert(2, "X")]),
            Err(Error::Limit("shared publication revision"))
        ));
        assert_eq!(live.checkpoint()?, before);
        live.check(&frozen)?;
        live.journal.publication = "1".into();
        assert!(live.apply(vec![insert(2, "Y")])?);
        assert!(live.document_json().contains("aAY"));
        assert!(!live.document_json().contains("aAX"));
        let fresh = RichReplica::from_journal(live.codec.clone(), live.journal.clone())?;
        assert_eq!(fresh.checkpoint()?, live.checkpoint()?);
        assert_eq!(fresh.document_json(), live.document_json());
    }
    Ok(())
}

#[test]
fn cached_prefix_still_reexecutes_and_rejects_altered_expected_effects() -> Result {
    for version in [1, 2] {
        let mut live = owner(version)?;
        assert!(live.apply(vec![insert(1, "A")])?);
        let before = live.checkpoint()?;
        let mut altered = live.journal.clone();
        let Entry::Local { expected, .. } = &mut altered.entries[0] else {
            return Err("expected local entry".into());
        };
        *expected = json!({"altered":true});
        assert!(matches!(
            RichReplica::from_journal_parts_cached(
                live.codec.clone(),
                altered,
                None,
                false,
                Some(live.replay_projections.fork_for_replay())
            ),
            Err(Error::ReplayMismatch)
        ));
        assert_eq!(live.checkpoint()?, before);
    }
    Ok(())
}

#[test]
fn empty_root_activation_still_requires_complete_adoption_checks() -> Result {
    for version in [1, 2] {
        let mut live = owner(version)?;
        let state = live.doc.state_vv();
        let oplog = live.doc.oplog_vv();
        live.doc.get_map("unexpected-empty-root");
        assert_eq!(live.doc.state_vv(), state);
        assert_eq!(live.doc.oplog_vv(), oplog);
        assert!(live.projection_cache.is_current(&live.doc, &live.token));
        live.refresh_document()?;
        assert!(matches!(live.validate_adoption(), Err(Error::Contract("rich shared root name"))));
    }
    Ok(())
}
