//! Deterministic V4 projection repairs over a merged causal state (model 14 only).
//!
//! Every V4 invariant that two individually admitted concurrent edits can break is
//! repaired here, as a pure function of the converged replica, so every peer projects
//! the same admitted document. Repairs never delete causal state: they only choose how
//! retained content is shown, so later edits or selective Undo can make it visible
//! again. Local commands are still checked by complete native admission before
//! publication; these rules apply only where concurrency could combine valid edits
//! into an invalid document.
//!
//! - **Mention atomicity.** A maximal stretch carrying one equal mention value that is
//!   not whole copies of `@` + label (a concurrent insertion inside it, a partial
//!   concurrent deletion) is projected as plain text: the mention format is dropped on
//!   that stretch, the characters stay.
//! - **Bookmark uniqueness.** When several blocks carry the same bookmark name, the
//!   first in document (pre-)order keeps it; later blocks project without it.
//! - **Section summary first.** The first summary child of a section is moved to the
//!   front; any further summary projects as a paragraph; a section without a summary
//!   shows an empty derived summary, and an empty body shows the derived fallback
//!   paragraph (handled with the other container fallbacks).
//! - **Page break root-only.** Placement suspends incompatible moves; a page break
//!   that would still project below the document root is not shown.
//! - **Table caption last.** Rows keep their replicated order and the first caption
//!   paragraph is projected after every row (canonical, so appending a row after a
//!   caption is an ordinary edit); further caption candidates are not shown.
//! - **Image link.** `image-link-new-window` without `image-href` is dropped, and a
//!   decorative image never projects a link (the accessible-name rule wins).
use super::model::virtual_id;
use serde_json::{Value, json};
use std::{cell::Cell, collections::BTreeSet};

thread_local! {
    static REPAIRS: Cell<usize> = const { Cell::new(0) };
}
pub(super) fn repaired() {
    REPAIRS.with(|count| count.set(count.get().saturating_add(1)));
}
/// Count the V4 repairs of one complete projection of `doc`.
/// # Errors
/// Projection failures propagate unchanged.
pub(super) fn repair_count(doc: &loro::LoroDoc) -> Result<usize, crate::Error> {
    let (value, count) = counted(|| super::materialize::envelope(doc));
    value.map(|_| count)
}
/// Run one projection and count the V4 repairs it applied.
///
/// A local command may never increase this count: repairs exist for concurrent
/// merges, not to make an invalid local edit look admitted.
pub(super) fn counted<T>(project: impl FnOnce() -> T) -> (T, usize) {
    let before = REPAIRS.with(Cell::get);
    let value = project();
    let after = REPAIRS.with(Cell::get);
    (value, after.wrapping_sub(before))
}

pub(super) const SUMMARY: &str = "breditor/details-summary";
const MENTION: &str = "breditor/mention";
const BOOKMARK: &str = "breditor/bookmark";

fn mention_of(run: &Value) -> Option<&Value> {
    run["formats"].as_array()?.iter().find(|format| format["type"] == MENTION)
}

/// Strip the mention format from every stretch that is not whole `@label` units.
pub(super) fn repair_mentions(runs: &mut Vec<Value>) {
    let mut start = 0;
    while start < runs.len() {
        let Some(value) = mention_of(&runs[start]).cloned() else {
            start += 1;
            continue;
        };
        let mut end = start + 1;
        while end < runs.len() && mention_of(&runs[end]) == Some(&value) {
            end += 1;
        }
        let text: String =
            runs[start..end].iter().filter_map(|run| run["text"].as_str()).collect::<String>();
        let unit =
            value["properties"]["breditor/mention-label"].as_str().map(|label| format!("@{label}"));
        let whole = unit.is_some_and(|unit| {
            !text.is_empty()
                && text.len().is_multiple_of(unit.len())
                && text == unit.repeat(text.len() / unit.len())
        });
        if !whole {
            repaired();
            for run in &mut runs[start..end] {
                if let Some(formats) = run["formats"].as_array_mut() {
                    formats.retain(|format| format["type"] != MENTION);
                }
            }
        }
        start = end;
    }
    merge_equal_runs(runs);
}

fn merge_equal_runs(runs: &mut Vec<Value>) {
    let mut merged: Vec<Value> = Vec::with_capacity(runs.len());
    for run in runs.drain(..) {
        if let Some(prior) = merged.last_mut()
            && prior["formats"] == run["formats"]
        {
            let text = format!(
                "{}{}",
                prior["text"].as_str().unwrap_or_default(),
                run["text"].as_str().unwrap_or_default()
            );
            prior["text"] = json!(text);
        } else {
            merged.push(run);
        }
    }
    *runs = merged;
}

/// First summary first; later summaries become paragraphs; a missing one is derived.
/// Page breaks are never projected inside a section.
pub(super) fn order_details(block: &str, children: &mut Vec<Value>) {
    children.retain(|child| {
        let keep = child["type"] != "breditor/page-break";
        if !keep {
            repaired();
        }
        keep
    });
    let first = children.iter().position(|child| child["type"] == SUMMARY);
    if first.is_none_or(|index| index != 0) {
        repaired();
    }
    let summary = if let Some(index) = first {
        children.remove(index)
    } else {
        json!({"kind":"element","type":SUMMARY,"entityId":null,
            "properties":{"breditor/block-id":virtual_id("details-summary",&[block])},"children":[]})
    };
    for child in children.iter_mut() {
        if child["type"] == SUMMARY {
            repaired();
            child["type"] = json!("breditor/paragraph");
        }
    }
    children.insert(0, summary);
}

/// Keep rows in replicated order and return the single trailing caption, if any.
/// Only a second caption candidate (or any other non-row child) counts as a repair.
pub(super) fn take_table_caption(children: &mut Vec<Value>) -> Option<Value> {
    let mut caption = None;
    let mut misplaced = false;
    children.retain(|child| {
        // Rows are always projected before the caption: a row appended "at the end"
        // after a caption is canonical, not a repair (as in the local V4 grammar).
        if child["type"] == "breditor/table-row" {
            return true;
        }
        if caption.is_none() && child["type"] == "breditor/paragraph" {
            caption = Some(child.clone());
        } else {
            misplaced = true;
        }
        false
    });
    if misplaced {
        repaired();
    }
    caption
}

/// Image link pair repairs: a lone new-window flag or a link on a decorative image.
pub(super) fn repair_image_link(properties: &mut serde_json::Map<String, Value>) {
    if properties.get("breditor/decorative") == Some(&Value::Bool(true))
        && properties.remove("breditor/image-href").is_some()
    {
        repaired();
    }
    if !properties.contains_key("breditor/image-href")
        && properties.remove("breditor/image-link-new-window").is_some()
    {
        repaired();
    }
}

/// Every V4 per-node property rule of the projection.
pub(super) fn project_properties(kind: &str, properties: &mut serde_json::Map<String, Value>) {
    project_list_numbering(kind, properties);
    if kind == "breditor/image" {
        repair_image_link(properties);
    }
}

/// Numbering properties belong only to ordered lists; a concurrent kind change to a
/// bullet list keeps them causal (for selective Undo) but never projects them.
pub(super) fn project_list_numbering(kind: &str, properties: &mut serde_json::Map<String, Value>) {
    if kind != "breditor/ordered-list" {
        properties.remove("breditor/list-style");
        properties.remove("breditor/list-reversed");
    }
}

/// Document-order uniqueness of bookmark names over the projected tree.
pub(super) fn dedupe_bookmarks(nodes: &mut [Value]) {
    fn visit(node: &mut Value, seen: &mut BTreeSet<String>) {
        if let Some(properties) = node["properties"].as_object_mut()
            && let Some(name) = properties.get(BOOKMARK).and_then(Value::as_str).map(str::to_owned)
            && !seen.insert(name)
        {
            repaired();
            properties.remove(BOOKMARK);
        }
        if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            for child in children {
                if child["kind"] == "element" {
                    visit(child, seen);
                }
            }
        }
    }
    let mut seen = BTreeSet::new();
    for node in nodes {
        visit(node, &mut seen);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn run(text: &str, formats: &Value) -> Value {
        json!({"kind":"text","text":text,"formats":formats})
    }
    fn mention(label: &str) -> Value {
        json!({"type":MENTION,"properties":{"breditor/mention-id":"u","breditor/mention-kind":"user","breditor/mention-label":label}})
    }
    fn block(id: &str, kind: &str) -> Value {
        json!({"kind":"element","type":kind,"properties":{"breditor/block-id":id},"children":[]})
    }
    #[test]
    fn whole_mention_units_survive_and_partial_stretches_become_plain_text() {
        let bold = json!({"type":"breditor/strong","properties":{}});
        let mut runs = vec![
            run("@A", &json!([bold, mention("Ann")])),
            run("nn@Ann", &json!([mention("Ann")])),
            run(" ", &json!([])),
        ];
        let original = runs.clone();
        let ((), count) = counted(|| repair_mentions(&mut runs));
        assert_eq!((runs, count), (original, 0));
        let mut runs = vec![
            run("x", &json!([])),
            run("@Azznn", &json!([mention("Ann")])),
            run("y", &json!([])),
        ];
        let ((), count) = counted(|| repair_mentions(&mut runs));
        assert_eq!(count, 1);
        assert_eq!(runs, vec![run("x@Azznny", &json!([]))]);
    }
    #[test]
    fn sections_tables_images_and_bookmarks_repair_deterministically() {
        let mut children =
            vec![block("b", "breditor/paragraph"), block("s", SUMMARY), block("t", SUMMARY)];
        let ((), count) = counted(|| order_details("sec", &mut children));
        assert_eq!(count, 2);
        let kinds: Vec<_> = children.iter().map(|c| c["type"].clone()).collect();
        assert_eq!(
            kinds,
            [json!(SUMMARY), json!("breditor/paragraph"), json!("breditor/paragraph")]
        );
        let mut empty = vec![];
        order_details("sec", &mut empty);
        assert_eq!(
            empty[0]["properties"]["breditor/block-id"],
            json!(virtual_id("details-summary", &["sec"]))
        );
        let mut rows = vec![
            block("cap", "breditor/paragraph"),
            block("r", "breditor/table-row"),
            block("cap2", "breditor/paragraph"),
        ];
        let (caption, count) = counted(|| take_table_caption(&mut rows));
        assert_eq!(count, 1);
        assert_eq!(
            caption.map(|c| c["properties"]["breditor/block-id"].clone()),
            Some(json!("cap"))
        );
        assert_eq!(rows.len(), 1);
        let mut rows = vec![block("cap", "breditor/paragraph"), block("r", "breditor/table-row")];
        let (_, count) = counted(|| take_table_caption(&mut rows));
        assert_eq!(count, 0, "a row after the caption is canonical, not a repair");
        let mut image = serde_json::Map::new();
        image.insert("breditor/decorative".into(), json!(true));
        image.insert("breditor/image-href".into(), json!("https://example.com/"));
        image.insert("breditor/image-link-new-window".into(), json!(true));
        repair_image_link(&mut image);
        assert!(!image.contains_key("breditor/image-href"));
        assert!(!image.contains_key("breditor/image-link-new-window"));
        let mut tree = vec![block("one", "breditor/paragraph"), block("two", "breditor/heading")];
        for node in &mut tree {
            node["properties"]["breditor/bookmark"] = json!("same");
        }
        dedupe_bookmarks(&mut tree);
        assert_eq!(tree[0]["properties"]["breditor/bookmark"], "same");
        assert!(tree[1]["properties"].get("breditor/bookmark").is_none());
    }
}
