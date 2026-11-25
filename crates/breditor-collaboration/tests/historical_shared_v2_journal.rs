//! Recover an unchanged journal emitted by the first shared structural V2 SDK source.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use serde_json::{Value, json};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const PROFILE: &str = include_str!("fixtures/shared-v2-first-sdk/profile.json");
const CAPTURE: &str = include_str!("fixtures/shared-v2-first-sdk/journal.json");
const ROOM: &str = "historical-shared-v2";

fn assert_content(owner: &RichReplica, first: &str, code: bool) -> Result {
    let document: Value = serde_json::from_str(owner.document_json())?;
    let blocks = document["root"]["children"].as_array().ok_or("missing document blocks")?;
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0]["type"], "breditor/paragraph");
    assert_eq!(blocks[0]["children"], json!([{ "kind": "text", "text": first, "formats": [] }]));
    assert_eq!(
        blocks[1]["children"],
        json!([{ "kind": "text", "text": "return 2", "formats": [] }])
    );
    if code {
        assert_eq!(blocks[1]["type"], "breditor/code-block");
        assert_eq!(blocks[1]["properties"]["breditor/language"], "Rust");
    } else {
        assert_eq!(blocks[1]["type"], "breditor/paragraph");
        assert!(blocks[1]["properties"]["breditor/language"].is_null());
    }
    Ok(())
}

#[test]
fn historical_structural_v2_returns_the_exact_cut_and_replays_both_branches() -> Result {
    let saved = CAPTURE.strip_suffix('\n').ok_or("expected the retained terminal LF")?;
    let profile = SharedRichProfile::from_standard_configuration_json_v2(PROFILE)?;
    let mut owner = profile.restore(ROOM, saved)?;
    assert_eq!(owner.checkpoint()?, saved);
    assert_eq!((owner.undo_count(), owner.redo_count()), (1, 1));
    assert_content(&owner, "north!", false)?;
    let view: Value = serde_json::from_str(&owner.view_json()?)?;
    let point = json!({ "block": "sample", "offset": "3", "affinity": "before" });
    assert_eq!(view["selection"], json!({ "kind": "text", "anchor": point, "focus": point }));
    assert_eq!(view["pendingFormatsJson"], "[]");

    for (redo, depth, first, code) in [
        (true, (2, 0), "north!", true),
        (false, (1, 1), "north!", false),
        (false, (0, 2), "north", false),
        (true, (1, 1), "north!", false),
        (true, (2, 0), "north!", true),
    ] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        let checkpoint = owner.checkpoint()?;
        drop(owner);
        owner = profile.restore(ROOM, &checkpoint)?;
        assert_eq!(owner.checkpoint()?, checkpoint);
        assert_eq!((owner.undo_count(), owner.redo_count()), depth);
        assert_content(&owner, first, code)?;
    }

    assert!(owner.apply(vec![Command::InsertText(InsertText {
        block: "note".into(),
        offset: 6,
        text: "?".into(),
    })])?);
    assert_content(&owner, "north!?", true)?;
    let future = owner.checkpoint()?;
    drop(owner);
    let mut reopened = profile.restore(ROOM, &future)?;
    assert_eq!(reopened.checkpoint()?, future);
    assert!(reopened.undo()?);
    assert_content(&reopened, "north!", true)?;
    assert!(reopened.redo()?);
    assert_content(&reopened, "north!?", true)?;
    Ok(())
}

#[test]
fn historical_structural_v2_refuses_other_rooms_and_profiles() -> Result {
    let correct = SharedRichProfile::from_standard_configuration_json_v2(PROFILE)?;
    let foreign = SharedRichProfile::from_configuration_json_v2(PROFILE)?;
    assert_ne!(correct.schema().fingerprint(), foreign.schema().fingerprint());
    let mut configuration: Value = serde_json::from_str(PROFILE)?;
    configuration["formatVersion"] = json!(1);
    let older = SharedRichProfile::from_standard_configuration_json_v1(&configuration.to_string())?;
    configuration["formatVersion"] = json!(3);
    let newer = SharedRichProfile::from_standard_configuration_json_v3(&configuration.to_string())?;
    for (profile, room, reason) in [
        (&correct, "foreign-room", "rich journal room binding"),
        (&foreign, ROOM, "rich replica schema admission"),
        (&older, ROOM, "rich replica journal version"),
        (&newer, ROOM, "rich replica journal version"),
    ] {
        let error =
            profile.restore(room, CAPTURE).err().ok_or("unexpected historical admission")?;
        assert!(error.to_string().contains(reason), "{error}");
    }
    Ok(())
}
