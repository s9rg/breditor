//! Real original/segmented native histories, both existing digest families and cold replay.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile, WriterClock,
    actions::{InsertText, ResizeColumn, SetImageAlt},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const A: &str = "9007199254740993";
const B: &str = "9007199254740995";
fn profile(version: u32, standard: bool) -> Result<(SharedRichProfile, String)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/author-prefix","version":1},"extensions":[]}).to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let content: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/author-prefix","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":content}).to_string();
    Ok((profile, document))
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn head(owner: &RichReplica, writer: &str, version: u32) -> Result<WriterClock> {
    Ok(if version == 1 { owner.writer_clock(writer)? } else { owner.writer_clock_v2(writer)? })
}
fn at(owner: &RichReplica, writer: &str, through: &str, version: u32) -> Result<WriterClock> {
    Ok(if version == 1 {
        owner.writer_clock_at(writer, through)?
    } else {
        owner.writer_clock_at_v2(writer, through)?
    })
}
fn saved(owner: &RichReplica, segmented: bool) -> Result<String> {
    Ok(if segmented { owner.segmented_checkpoint()? } else { owner.checkpoint()? })
}

#[test]
fn all_native_profiles_keep_old_peer_and_server_prefixes_after_later_ops_cold_replay_and_future_undo()
-> Result {
    let mut cases = 0;
    for language in [1, 2, 3] {
        for standard in [false, true] {
            for segmented in [false, true] {
                let (profile, document) = profile(language, standard)?;
                let mut seed = profile.create(&document, "101".into())?;
                let initial = seed.update_frame()?;
                let mut a = profile.join_frame("room".into(), A.into(), &initial)?;
                let mut b = profile.join_frame("room".into(), B.into(), &initial)?;
                if segmented {
                    a.enable_segmented_history_guarded(
                        &a.observe()?,
                        "a-root".into(),
                        "a-one".into(),
                    )?;
                    b.enable_segmented_history_guarded(
                        &b.observe()?,
                        "b-root".into(),
                        "b-one".into(),
                    )?;
                }
                let empty = [head(&a, A, 1)?, head(&a, A, 2)?];
                let genesis = [head(&seed, "101", 1)?, head(&seed, "101", 2)?];
                assert!(genesis[0].through.parse::<u32>()? > 0);
                a.apply(vec![insert("p", "Accepted 日本 🙂 ")])?;
                let accepted = [head(&a, A, 1)?, head(&a, A, 2)?];
                if segmented {
                    a.seal_history_segment_guarded(&a.observe()?, "a-two".into())?;
                }
                a.apply(vec![
                    Command::ResizeColumn(ResizeColumn {
                        block: "table-block".into(),
                        column: "c".into(),
                        width: 310,
                    }),
                    Command::SetImageAlt(SetImageAlt {
                        block: "image-block".into(),
                        text: "Later source".into(),
                        decorative: false,
                    }),
                ])?;
                a.undo()?;
                a.redo()?;
                b.apply(vec![insert("caption", "Peer kept ")])?;
                b.receive_frame(&a.update_frame()?)?;
                seed.apply(vec![insert("p", "Server later ")])?;
                b.receive_frame(&seed.update_frame()?)?;
                assert!(head(&b, "101", 1)?.through.parse::<u32>()? > genesis[0].through.parse()?);
                if segmented {
                    b.seal_history_segment_guarded(&b.observe()?, "b-two".into())?;
                }
                b.set_read_only_guarded(&b.observe()?, true)?;
                let before = saved(&b, segmented)?;
                let observation = b.observe()?;
                for version in [1, 2] {
                    let index = usize::try_from(version - 1)?;
                    assert_eq!(at(&b, A, "0", version)?, empty[index]);
                    assert_eq!(at(&b, A, &accepted[index].through, version)?, accepted[index]);
                    assert_eq!(at(&b, "101", &genesis[index].through, version)?, genesis[index]);
                    let current = head(&b, A, version)?;
                    assert_eq!(at(&b, A, &current.through, version)?, current);
                    cases += 1;
                }
                assert_eq!(saved(&b, segmented)?, before);
                b.check(&observation)?;
                let mut cold = if segmented {
                    profile.restore_segmented("room", &before)?
                } else {
                    profile.restore("room", &before)?
                };
                for version in [1, 2] {
                    let expected = &accepted[usize::try_from(version - 1)?];
                    assert_eq!(at(&cold, A, &expected.through, version)?, *expected);
                }
                assert_eq!(saved(&cold, segmented)?, before);
                cold.set_read_only_guarded(&cold.observe()?, false)?;
                let text = cold.document_json().to_owned();
                assert!(cold.undo()?);
                assert!(cold.document_json().contains("Accepted 日本"));
                assert!(cold.redo()?);
                assert_eq!(cold.document_json(), text);
            }
        }
    }
    assert_eq!(cases, 24);
    Ok(())
}

#[test]
fn malformed_and_unapplied_prefixes_refuse_without_changing_any_native_state() -> Result {
    let (profile, document) = profile(3, true)?;
    let seed = profile.create(&document, "101".into())?;
    let mut owner = profile.join_frame("room".into(), B.into(), &seed.update_frame()?)?;
    owner.apply(vec![insert("p", "Own history")])?;
    owner.undo()?;
    let before = owner.checkpoint()?;
    let observation = owner.observe()?;
    for version in [1, 2] {
        for writer in ["", "0", "01", "-1", "18446744073709551615", "18446744073709551616", "１２"]
        {
            assert!(at(&owner, writer, "0", version).is_err());
        }
        for end in ["", "00", "01", "-1", "1 ", "2147483648", "99999999999999999999", "１"] {
            assert!(at(&owner, B, end, version).is_err());
        }
        assert!(at(&owner, A, "1", version).is_err());
        assert_eq!(at(&owner, A, "0", version)?, head(&owner, A, version)?);
        let future = (head(&owner, B, version)?.through.parse::<u32>()? + 1).to_string();
        assert!(at(&owner, B, &future, version).is_err());
    }
    assert_eq!(owner.checkpoint()?, before);
    owner.check(&observation)?;
    assert!(owner.redo()?);
    Ok(())
}
