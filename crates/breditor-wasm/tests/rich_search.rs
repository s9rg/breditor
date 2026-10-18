//! Opaque local search ownership, bounded live handles and exact unchanged local checkpoint families.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{
    BreditorRichEditor, BreditorRichProfile, BreditorRichSearchResults, BreditorStringResult,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut value: BreditorStringResult) -> Result<String> {
    value.take_value().ok_or("value".into())
}
fn profile(language: u32) -> Result<BreditorRichProfile> {
    let input=json!({"format":"breditor/profile-bootstrap","formatVersion":language+5,"schema":{"name":"example/wasm-search","version":1},"extensions":[]}).to_string();
    let mut result = match language {
        1 => BreditorRichProfile::from_standard_bootstrap_json_v1(&input),
        2 => BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&input),
        _ => BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&input),
    };
    result.take_profile().ok_or("profile".into())
}
fn owner(p: &BreditorRichProfile, text: &str) -> Result<BreditorRichEditor> {
    let binding: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":if text.is_empty(){json!([])}else{json!([{"kind":"text","text":text,"formats":[]}])}}]});
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],"root":root}).to_string(),"100").take_editor().ok_or("owner".into())
}
fn query(pattern: &str, mode: &str) -> String {
    json!({"pattern":pattern,"mode":mode,"caseSensitive":true,"wholeWords":false}).to_string()
}
fn replacement(text: &str, mode: &str) -> String {
    json!({"text":text,"mode":mode}).to_string()
}
fn find(a: &BreditorRichEditor, pattern: &str) -> Result<BreditorRichSearchResults> {
    a.find_text(&a.observe(), &query(pattern, "literal")).take_results().ok_or("results".into())
}
fn saved(a: &BreditorRichEditor) -> Result<String> {
    read(a.checkpoint_json())
}
fn run(a: &mut BreditorRichEditor, kind: &str) -> Result {
    let result = a.execute(&a.observe(), &json!({"kind":kind}).to_string());
    if result.status() != kind {
        return Err(format!("expected {kind}, got {}", result.status()).into());
    }
    Ok(())
}
#[test]
fn pure_one_shot_reads_are_actor_bound_and_invalid_values_preserve_the_snapshot() -> Result {
    let p = profile(1)?;
    let a = owner(&p, "cat🙂cat")?;
    let b = owner(&p, "cat🙂cat")?;
    assert_eq!(a.search_version(), "1");
    let before = saved(&a)?;
    let observed = a.observe();
    let mut result = a.find_text(&observed, &query("cat", "literal"));
    assert_eq!(result.status(), "results");
    let found = result.take_results().ok_or("results")?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_results().is_none());
    let metadata: Value = serde_json::from_str(&found.metadata_json())?;
    assert_eq!(metadata["count"], "2");
    assert_eq!(metadata["matches"][1]["start"], "5");
    assert_eq!(saved(&a)?, before);
    assert_eq!(read(a.check_search_results(&observed, &found))?, "true");
    assert_eq!(b.check_search_results(&b.observe(), &found).status(), "error");
    assert_eq!(
        a.find_text(&b.observe(), "not json").error().ok_or("error")?.code(),
        "breditor_rich.stale_observation"
    );
    Ok(())
}
#[test]
fn readonly_navigation_changes_only_ui_and_keeps_redo_and_live_results() -> Result {
    let p = profile(1)?;
    let mut a = owner(&p, "cat🙂cat")?;
    let found = find(&a, "cat")?;
    assert_eq!(
        a.replace_search_all(&a.observe(), &found, &replacement("dog", "literal")).status(),
        "content"
    );
    run(&mut a, "undo")?;
    read(a.set_read_only(&a.observe(), true))?;
    assert_eq!(a.select_search_match(&a.observe(), &found, "1").status(), "selection");
    assert_eq!(read(a.check_search_results(&a.observe(), &found))?, "true");
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["redoDepth"], 1);
    assert_eq!(view["selection"]["anchor"]["offset"], "5");
    assert_eq!(read(found.navigate(r#"{"active":"0","direction":"next","wrap":false}"#))?, "1");
    assert_eq!(
        found.navigate(r#"{"active":"1","direction":"next","wrap":false}"#).status(),
        "absent"
    );
    let before = saved(&a)?;
    assert_eq!(
        a.replace_search_all(&a.observe(), &found, &replacement("dog", "literal"))
            .error()
            .ok_or("error")?
            .code(),
        "breditor_rich.read_only"
    );
    assert_eq!(saved(&a)?, before);
    Ok(())
}
#[test]
fn all_original_grammars_and_grouping_policies_recover_exact_future_undo_and_real_ui() -> Result {
    for language in 1..=3 {
        for natural in [false, true] {
            let p = profile(language)?;
            let mut a = owner(&p, "cat🙂cat")?;
            if natural {
                read(a.enable_typing_history(&a.observe()))?;
            }
            let select = json!({"kind":"setSelection","selection":{"kind":"text","anchor":{"block":"body","offset":"8","affinity":"after"},"focus":{"block":"body","offset":"0","affinity":"after"}}});
            assert_eq!(a.execute(&a.observe(), &select.to_string()).status(), "selection");
            let found = a
                .find_text(&a.observe(), &query("(?P<word>cat)", "regex"))
                .take_results()
                .ok_or("results")?;
            assert_eq!(
                a.replace_search_all(&a.observe(), &found, &replacement("${word}!", "captures"))
                    .status(),
                "content"
            );
            let packet = saved(&a)?;
            assert!(!packet.contains("(?P<word>") && !packet.contains("${word}!"));
            let mut b =
                if natural { p.restore_typing_editor(&packet) } else { p.restore_editor(&packet) }
                    .take_editor()
                    .ok_or("restore")?;
            assert_eq!(b.check_search_results(&b.observe(), &found).status(), "error");
            let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
            assert_eq!(view["undoDepth"], 1);
            assert_eq!(view["selection"]["anchor"]["offset"], "10");
            for kind in ["undo", "redo", "undo", "redo"] {
                run(&mut a, kind)?;
                run(&mut b, kind)?;
                assert_eq!(saved(&a)?, saved(&b)?);
            }
        }
    }
    Ok(())
}
#[test]
fn invalid_indices_templates_and_stale_observations_are_atomic_and_identities_do_not_publish()
-> Result {
    let p = profile(1)?;
    let mut a = owner(&p, "cat cat")?;
    let found = find(&a, "cat")?;
    let observed = a.observe();
    let before = saved(&a)?;
    assert_eq!(
        a.replace_search_all(&observed, &found, &replacement("cat", "literal")).status(),
        "unchanged"
    );
    for index in ["01", "-1", "1.0", "4096", "2"] {
        assert_eq!(a.select_search_match(&observed, &found, index).status(), "error");
    }
    assert_eq!(
        a.replace_search_one(&observed, &found, "0", &replacement("${unknown}", "captures"))
            .status(),
        "error"
    );
    assert_eq!(saved(&a)?, before);
    assert_eq!(read(a.check_search_results(&observed, &found))?, "true");
    assert_eq!(a.select_search_match(&observed, &found, "0").status(), "selection");
    let current = saved(&a)?;
    assert_eq!(
        a.replace_search_all(&observed, &found, "not json").error().ok_or("error")?.code(),
        "breditor_rich.stale_observation"
    );
    assert_eq!(saved(&a)?, current);
    assert_eq!(a.execute(&a.observe(), r#"{"kind":"replaceSearchAll"}"#).status(), "error");
    Ok(())
}
#[test]
fn eight_live_reads_are_bounded_and_discarding_wrappers_or_results_releases_capacity() -> Result {
    let p = profile(1)?;
    let a = owner(&p, "cat")?;
    let mut handles = Vec::new();
    for _ in 0..8 {
        handles.push(find(&a, "cat")?);
    }
    assert_eq!(
        a.find_text(&a.observe(), &query("cat", "literal")).error().ok_or("error")?.code(),
        "breditor_rich.search_handles"
    );
    handles.pop();
    {
        let result = a.find_text(&a.observe(), &query("cat", "literal"));
        assert_eq!(result.status(), "results");
    }
    handles.push(find(&a, "cat")?);
    drop(a);
    for found in handles {
        let metadata: Value = serde_json::from_str(&found.metadata_json())?;
        assert_eq!(metadata["count"], "1");
    }
    Ok(())
}
#[test]
fn maximum_complete_hits_still_use_one_old_local_history_entry() -> Result {
    let p = profile(3)?;
    let mut a = owner(&p, &"x ".repeat(4096))?;
    let found = find(&a, "x")?;
    let metadata: Value = serde_json::from_str(&found.metadata_json())?;
    assert_eq!(metadata["matches"].as_array().ok_or("matches")?.len(), 4096);
    let before = read(a.observe().document_json())?;
    assert_eq!(
        a.replace_search_all(&a.observe(), &found, &replacement("y", "literal")).status(),
        "content"
    );
    let view: Value = serde_json::from_str(&read(a.observe().view_json())?)?;
    assert_eq!(view["undoDepth"], 1);
    run(&mut a, "undo")?;
    assert_eq!(read(a.observe().document_json())?, before);
    Ok(())
}
