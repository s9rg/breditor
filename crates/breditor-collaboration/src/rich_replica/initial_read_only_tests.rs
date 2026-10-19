//! Native policy gate invariants; the actual Wasm boundary is separately exercised.
use super::InitialReadOnly;
use crate::{
    Error,
    rich_replica::{Command, SharedRichProfile, actions::InsertText},
};
use serde_json::{Value, json};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn setup(version: u32, standard: bool) -> Result<(SharedRichProfile, String)> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/initial-policy","version":1},"extensions":[]})
    .to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&config)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&config)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&config)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
        _ => return Err("unsupported test profile".into()),
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/initial-policy","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string();
    Ok((profile, document))
}

fn insert(text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })
}

#[test]
fn initial_lock_preserves_exact_original_history_and_is_never_a_saved_permission() -> Result {
    for version in [1, 2, 3] {
        for standard in [false, true] {
            let (profile, document) = setup(version, standard)?;
            let mut source = profile.create(&document, "101".into())?;
            source.apply(vec![insert("retained offline ")])?;
            source.undo()?;
            let checkpoint = source.checkpoint()?;
            let mut restored = profile.restore("room", &checkpoint)?;
            let causal = restored.causal_version();
            let counts = (restored.undo_count(), restored.redo_count());
            let gate = InitialReadOnly::new();
            gate.initialize(&mut restored, true)?;
            assert!(restored.is_read_only());
            assert_eq!(restored.checkpoint()?, checkpoint);
            assert_eq!(restored.causal_version(), causal);
            assert_eq!((restored.undo_count(), restored.redo_count()), counts);
            for value in [true, false] {
                assert!(gate.initialize(&mut restored, value).is_err());
                assert!(restored.is_read_only());
                assert_eq!(restored.checkpoint()?, checkpoint);
            }
            for outcome in
                [restored.apply(vec![insert("denied")]), restored.undo(), restored.redo()]
            {
                assert!(matches!(outcome, Err(Error::ReadOnly)));
                assert_eq!(restored.checkpoint()?, checkpoint);
            }
            let observed = restored.observe()?;
            let view: Value = serde_json::from_str(observed.view_json())?;
            assert_eq!(view["readOnly"], true);
            assert!(view.get("readOnlyRevision").is_none());
            assert!(restored.set_read_only_guarded(&observed, false)?);
            assert!(restored.check(&observed).is_err());
            restored.redo()?;
            source.redo()?;
            let mut expected: Value = serde_json::from_str(&source.checkpoint()?)?;
            let mut actual: Value = serde_json::from_str(&restored.checkpoint()?)?;
            expected.as_object_mut().ok_or("journal")?.remove("publication");
            actual.as_object_mut().ok_or("journal")?.remove("publication");
            assert_eq!(actual, expected);
            let again = profile.restore("room", &restored.checkpoint()?)?;
            assert!(!again.is_read_only());
        }
    }
    Ok(())
}

#[test]
fn issuing_even_a_later_disposed_observation_permanently_seals_initialization() -> Result {
    let (profile, document) = setup(3, true)?;
    let mut owner = profile.create(&document, "101".into())?;
    let gate = InitialReadOnly::new();
    let observed = owner.observe()?;
    gate.seal();
    drop(observed);
    let exact = owner.checkpoint()?;
    for value in [false, true, false] {
        assert!(gate.initialize(&mut owner, value).is_err());
        assert!(!owner.is_read_only());
        assert_eq!(owner.checkpoint()?, exact);
        gate.seal();
    }
    Ok(())
}

#[test]
fn explicit_false_is_one_shot_and_remote_admission_cannot_unlock_initial_policy() -> Result {
    let (profile, document) = setup(3, true)?;
    let mut source = profile.create(&document, "101".into())?;
    let gate = InitialReadOnly::new();
    let exact = source.checkpoint()?;
    gate.initialize(&mut source, false)?;
    assert_eq!(source.checkpoint()?, exact);
    assert!(gate.initialize(&mut source, true).is_err());
    let mut reader = profile.join_frame("room".into(), "202".into(), &source.update_frame()?)?;
    InitialReadOnly::new().initialize(&mut reader, true)?;
    source.apply(vec![insert("incoming ")])?;
    reader.receive_frame(&source.update_frame()?)?;
    assert!(reader.is_read_only());
    assert!(matches!(reader.apply(vec![insert("denied")]), Err(Error::ReadOnly)));
    Ok(())
}
