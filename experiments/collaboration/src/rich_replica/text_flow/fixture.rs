//! Deterministic native/Wasm text-flow lowerer fixtures, not shared editor integration.
use crate::{
    Error,
    anchor::Affinity,
    rich_replica::{
        model,
        text_flow::{self, FlowAnchor, PreparedJoin, PreparedSplit},
    },
};
use loro::{ExportMode, LoroDoc, UndoManager};
use serde_json::{Value, json};

/// Closed functional text-flow scenarios exercised identically in Rust and all browser engines.
pub const SCENARIOS: [&str; 8] = [
    "split_offline",
    "join_offline",
    "reordered_range",
    "selective_history",
    "causal_boundaries",
    "observed_boundary",
    "concurrent_cuts",
    "join_cycle",
];

/// Exercise original-character split/join/range/routing/history behavior in the isolated model.
///
/// # Errors
/// Rejects unknown scenario names and any failed engine, anchor or projection contract.
pub fn exercise(scenario: &str) -> Result<String, Error> {
    let doc = seed()?;
    let details = match scenario {
        "split_offline" => split_offline(&doc)?,
        "join_offline" => join_offline(&doc)?,
        "reordered_range" => reordered_range(&doc)?,
        "selective_history" => selective_history(&doc)?,
        "causal_boundaries" => boundaries(&doc)?,
        "observed_boundary" => observed_boundary(&doc)?,
        "concurrent_cuts" => concurrent_cuts(&doc)?,
        "join_cycle" => join_cycle(&doc)?,
        _ => return Err(Error::Contract("text-flow fixture scenario")),
    };
    let replica = fork(&doc, 33)?;
    let blocks = if scenario == "concurrent_cuts" {
        vec!["a", "b", "right", "other"]
    } else if scenario == "join_cycle" || scenario == "join_offline" {
        vec!["a", "b"]
    } else {
        vec!["a", "b", "right"]
    };
    let views: Vec<_> =
        blocks.iter().map(|block| text_flow::view(&doc, block)).collect::<Result<_, _>>()?;
    let restored: Vec<_> =
        blocks.iter().map(|block| text_flow::view(&replica, block)).collect::<Result<_, _>>()?;
    if views != restored {
        return Err(Error::Contract("text-flow restored projection"));
    }
    Ok(json!({"format":"breditor/text-flow-fixture","version":1,"scenario":scenario,"details":details,"views":views,"restored":restored,"sources":{"a":model::text(&doc,"a")?.to_string(),"b":model::text(&doc,"b")?.to_string()}}).to_string())
}

fn seed() -> Result<LoroDoc, Error> {
    let doc = LoroDoc::new();
    doc.set_peer_id(11)?;
    text_flow::configure(&doc);
    model::text(&doc, "a")?.push_str("ab🙂cd")?;
    model::text(&doc, "b")?.push_str("EF")?;
    text_flow::prepare_root(&doc, "a")?;
    text_flow::prepare_root(&doc, "b")?;
    doc.commit();
    Ok(doc)
}
fn fork(doc: &LoroDoc, writer: u64) -> Result<LoroDoc, Error> {
    let peer = LoroDoc::new();
    peer.set_peer_id(writer)?;
    text_flow::configure(&peer);
    peer.import(&doc.export(ExportMode::all_updates())?)?;
    Ok(peer)
}
fn sync(doc: &LoroDoc, peer: &LoroDoc) -> Result<(), Error> {
    doc.import(&peer.export(ExportMode::all_updates())?)?;
    peer.import(&doc.export(ExportMode::all_updates())?)?;
    Ok(())
}
fn split(doc: &LoroDoc, offset: u32, right: &str) -> Result<(), Error> {
    let plan = PreparedSplit::prepare(doc, "a", offset, right)?;
    doc.commit();
    plan.apply(doc)?;
    doc.commit();
    Ok(())
}
fn join(doc: &LoroDoc, left: &str, right: &str) -> Result<(), Error> {
    PreparedJoin::prepare(doc, left, right)?.apply(doc)?;
    doc.commit();
    Ok(())
}
fn texts(doc: &LoroDoc) -> Result<Value, Error> {
    Ok(json!({"a":text_flow::view(doc,"a")?.text(),"right":text_flow::view(doc,"right")?.text()}))
}
fn split_offline(doc: &LoroDoc) -> Result<Value, Error> {
    let peer = fork(doc, 22)?;
    let anchor = FlowAnchor::capture(&peer, "a", 4, Affinity::After)?;
    split(doc, 2, "right")?;
    text_flow::insert(&peer, "a", 4, Affinity::After, "X")?;
    peer.commit();
    text_flow::set_format(
        &peer,
        "a",
        2,
        3,
        json!({"type":"breditor/strong","properties":{}}),
        true,
    )?;
    peer.commit();
    sync(doc, &peer)?;
    Ok(
        json!({"anchor":anchor.resolve(doc)?,"converged":text_flow::view(doc,"right")?==text_flow::view(&peer,"right")?}),
    )
}
fn join_offline(doc: &LoroDoc) -> Result<Value, Error> {
    let peer = fork(doc, 22)?;
    let anchor = FlowAnchor::capture(&peer, "b", 1, Affinity::After)?;
    join(doc, "a", "b")?;
    text_flow::insert(&peer, "b", 1, Affinity::After, "🙂")?;
    peer.commit();
    sync(doc, &peer)?;
    Ok(
        json!({"anchor":anchor.resolve(doc)?,"converged":text_flow::view(doc,"a")?==text_flow::view(&peer,"a")?}),
    )
}
fn reordered_range(doc: &LoroDoc) -> Result<Value, Error> {
    split(doc, 4, "right")?;
    join(doc, "right", "a")?;
    let joined = text_flow::view(doc, "right")?.text();
    text_flow::set_format(
        doc,
        "right",
        1,
        3,
        json!({"type":"breditor/strong","properties":{}}),
        true,
    )?;
    doc.commit();
    text_flow::delete(doc, "right", 1, 3)?;
    doc.commit();
    Ok(json!({"joined":joined,"final":text_flow::view(doc,"right")?.text()}))
}
fn selective_history(doc: &LoroDoc) -> Result<Value, Error> {
    let mut undo = UndoManager::new(doc);
    undo.set_merge_interval(0);
    undo.pause();
    let plan = PreparedSplit::prepare(doc, "a", 2, "right")?;
    doc.commit();
    undo.resume();
    plan.apply(doc)?;
    doc.commit();
    let peer = fork(doc, 22)?;
    text_flow::insert(&peer, "right", 2, Affinity::After, "X")?;
    peer.commit();
    doc.import(&peer.export(ExportMode::all_updates())?)?;
    let mut steps = vec![texts(doc)?];
    for _ in 0..3 {
        undo.undo()?;
        steps.push(texts(doc)?);
        undo.redo()?;
        steps.push(texts(doc)?);
    }
    Ok(json!({"steps":steps}))
}
fn boundaries(doc: &LoroDoc) -> Result<Value, Error> {
    let before = FlowAnchor::capture(doc, "a", 6, Affinity::Before)?;
    let after = FlowAnchor::capture(doc, "a", 6, Affinity::After)?;
    split(doc, 6, "right")?;
    let clicked = FlowAnchor::capture(doc, "a", 6, Affinity::After)?;
    let encoded = serde_json::to_string(&after)?;
    let restored: FlowAnchor = serde_json::from_str(&encoded)?;
    let peer = fork(doc, 22)?;
    let mut values = json!({"before":before.resolve(doc)?,"after":after.resolve(doc)?,"clicked":clicked.resolve(doc)?,"restored":restored.resolve(&peer)?});
    text_flow::insert(doc, "right", 0, Affinity::After, "R")?;
    doc.commit();
    values["afterTyping"] = json!({"after":after.resolve(doc)?,"clicked":clicked.resolve(doc)?});
    Ok(values)
}
fn observed_boundary(doc: &LoroDoc) -> Result<Value, Error> {
    let end = FlowAnchor::capture(doc, "a", 6, Affinity::After)?;
    split(doc, 2, "right")?;
    let clicked = FlowAnchor::capture(doc, "a", 2, Affinity::After)?;
    let mut steps = vec![json!({"left":clicked.resolve(doc)?,"right":end.resolve(doc)?})];
    text_flow::insert(doc, "right", 0, Affinity::After, "R")?;
    doc.commit();
    steps.push(json!({"left":clicked.resolve(doc)?,"right":end.resolve(doc)?}));
    text_flow::insert(doc, "a", 2, Affinity::After, "L")?;
    doc.commit();
    steps.push(json!({"left":clicked.resolve(doc)?,"right":end.resolve(doc)?}));
    Ok(json!({"steps":steps}))
}
fn concurrent_cuts(doc: &LoroDoc) -> Result<Value, Error> {
    let peer = fork(doc, 22)?;
    let anchor = FlowAnchor::capture(doc, "a", 4, Affinity::After)?;
    split(doc, 2, "right")?;
    split(&peer, 4, "other")?;
    sync(doc, &peer)?;
    Ok(
        json!({"anchor":anchor.resolve(doc)?,"converged":text_flow::view(doc,"right")?==text_flow::view(&peer,"right")? && text_flow::view(doc,"other")?==text_flow::view(&peer,"other")?}),
    )
}
fn join_cycle(doc: &LoroDoc) -> Result<Value, Error> {
    let peer = fork(doc, 22)?;
    join(doc, "a", "b")?;
    join(&peer, "b", "a")?;
    sync(doc, &peer)?;
    let owner = text_flow::view(doc, "a")?.owner;
    Ok(
        json!({"owner":owner,"text":text_flow::view(doc,&owner)?.text(),"converged":text_flow::view(doc,&owner)?==text_flow::view(&peer,&owner)?}),
    )
}
