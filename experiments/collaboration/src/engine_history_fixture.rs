//! Closed deterministic authoring vectors for the isolated engine history patch.
use crate::Error;
use loro::{LoroDoc, StyleConfig, UndoManager, VersionVector};
use serde_json::{Value, json};

/// Closed engine-ordering scenarios; none accepts user content or engine bytes.
pub const SCENARIOS: [&str; 3] = ["containers", "map-fields", "text-marks"];

/// Exercise native undo/redo across independently ordered containers, keys or text marks.
/// # Errors
/// Rejects unknown scenarios or any failed engine/history operation.
pub fn exercise(scenario: &str) -> Result<String, Error> {
    if !SCENARIOS.contains(&scenario) {
        return Err(Error::Contract("engine history fixture scenario"));
    }
    let doc = LoroDoc::new();
    doc.set_peer_id(9_007_199_254_740_993)?;
    doc.set_record_timestamp(false);
    doc.config_default_text_style(Some(StyleConfig::default()));
    let keys = ["zulu", "alpha", "mike", "format-owner", "fragment-owner", "日本"];
    match scenario {
        "containers" => {
            for key in keys {
                doc.get_map(key).insert("value", 0)?;
            }
        }
        "map-fields" => {
            for key in keys {
                doc.get_map("fields").insert(key, 0)?;
            }
        }
        "text-marks" => doc.get_text("body").push_str("ab🙂c")?,
        _ => return Err(Error::Contract("engine history fixture scenario")),
    }
    doc.commit();
    let mut undo = UndoManager::new(&doc);
    match scenario {
        "containers" => {
            for key in keys {
                doc.get_map(key).insert("value", 1)?;
            }
        }
        "map-fields" => {
            for key in keys {
                doc.get_map("fields").insert(key, 1)?;
            }
        }
        "text-marks" => {
            for key in keys {
                doc.get_text("body").mark_utf16(0..5, key, true)?;
            }
        }
        _ => return Err(Error::Contract("engine history fixture scenario")),
    }
    doc.commit();
    let start = doc.oplog_vv();
    if !undo.undo()? {
        return Err(Error::Contract("engine fixture undo"));
    }
    let undone = operations(&doc, &start)?;
    let start = doc.oplog_vv();
    if !undo.redo()? {
        return Err(Error::Contract("engine fixture redo"));
    }
    Ok(json!({"undo":undone,"redo":operations(&doc,&start)?}).to_string())
}
fn operations(doc: &LoroDoc, start: &VersionVector) -> Result<Value, Error> {
    Ok(serde_json::to_value(
        doc.export_json_updates_without_peer_compression(start, &doc.oplog_vv()),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    type TestResult = Result<(), Box<dyn std::error::Error>>;
    fn values(value: &Value, field: &str) -> Vec<String> {
        value["changes"]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|change| change["ops"].as_array().into_iter().flatten())
            .filter_map(|op| {
                if field == "container" {
                    op[field].as_str()
                } else {
                    op["content"][field].as_str()
                }
            })
            .map(str::to_owned)
            .collect()
    }
    #[test]
    fn same_depth_containers_author_history_in_identity_order() -> TestResult {
        let value: Value = serde_json::from_str(&exercise("containers")?)?;
        for kind in ["undo", "redo"] {
            let order = values(&value[kind], "container");
            let mut sorted = order.clone();
            sorted.sort();
            assert_eq!(order.len(), 6);
            assert_eq!(order, sorted);
        }
        Ok(())
    }
    #[test]
    fn map_field_inverses_author_keys_in_lexical_order() -> TestResult {
        let value: Value = serde_json::from_str(&exercise("map-fields")?)?;
        for kind in ["undo", "redo"] {
            assert_eq!(
                values(&value[kind], "key"),
                ["alpha", "format-owner", "fragment-owner", "mike", "zulu", "日本"]
            );
        }
        Ok(())
    }
    #[test]
    fn text_mark_inverses_author_style_keys_in_lexical_order() -> TestResult {
        let value: Value = serde_json::from_str(&exercise("text-marks")?)?;
        for kind in ["undo", "redo"] {
            assert_eq!(
                values(&value[kind], "style_key"),
                ["alpha", "format-owner", "fragment-owner", "mike", "zulu", "日本"]
            );
        }
        Ok(())
    }
}
