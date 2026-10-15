//! Pure rich-profile compatibility over the currently visible retained forest.
//!
//! Kind choices are not retracted or coerced. Only placement candidates are
//! suspended; root escape is a real reserved occurrence, not a copied subtree.
use super::super::model;
use crate::Error;
use loro::LoroDoc;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) type Parents = BTreeMap<String, Option<String>>;
pub(super) enum Violation {
    Parent(String),
    NestedTable { table: String, path: Vec<String> },
}
enum Caption {
    Original,
    Absent,
    Selected(String),
}
struct Info {
    kind: String,
    active: bool,
    caption: Caption,
    column: Option<String>,
    columns: Option<BTreeSet<String>>,
}
pub(super) struct Grammar {
    info: BTreeMap<String, Info>,
}

impl Grammar {
    pub fn read(doc: &LoroDoc, directory: &Map<String, Value>) -> Result<Self, Error> {
        let mut info = BTreeMap::new();
        for (block, raw) in directory {
            let mut kind =
                raw["type"].as_str().ok_or(Error::Contract("placement owner kind"))?.to_owned();
            let mut caption = Caption::Original;
            for patch in
                model::patches(doc, raw.get("effects").unwrap_or(&Value::Object(Map::new())))?
            {
                if let Some(value) = patch.sets.get("$type") {
                    kind = value.as_str().ok_or(Error::Contract("placement kind intent"))?.into();
                }
                if let Some(value) = patch.sets.get("$caption") {
                    caption = if value.is_null() {
                        Caption::Absent
                    } else {
                        Caption::Selected(
                            value
                                .as_str()
                                .ok_or(Error::Contract("placement caption intent"))?
                                .to_owned(),
                        )
                    };
                }
            }
            let active = model::born(doc, raw)? && !model::any_deleted(doc, raw.get("deletions"))?;
            let column = if kind == "breditor/table-cell" {
                let identity: Value = serde_json::from_str(
                    raw["identity"].as_str().ok_or(Error::Contract("cell identity"))?,
                )?;
                Some(
                    identity["breditor/column-id"]
                        .as_str()
                        .ok_or(Error::Contract("cell column"))?
                        .to_owned(),
                )
            } else {
                None
            };
            let columns = if active && kind == "breditor/table" {
                Some(
                    super::super::column_order::visible(doc, block)?
                        .into_iter()
                        .map(|(column, _)| column)
                        .collect(),
                )
            } else {
                None
            };
            info.insert(block.clone(), Info { kind, active, caption, column, columns });
        }
        Ok(Self { info })
    }
    pub fn violation(&self, parents: &Parents) -> Result<Option<Violation>, Error> {
        for (block, parent) in parents {
            if !self.visible(block, parents)? {
                continue;
            }
            let kind = &self.get(block)?.kind;
            let parent_kind = parent
                .as_deref()
                .map(|id| self.get(id).map(|value| value.kind.as_str()))
                .transpose()?;
            if !allows(parent_kind, kind) {
                return Ok(Some(Violation::Parent(block.clone())));
            }
            if kind == "breditor/table" {
                let mut path = vec![block.clone()];
                let mut next = parent.as_deref();
                while let Some(parent) = next {
                    if self.get(parent)?.kind == "breditor/table" {
                        return Ok(Some(Violation::NestedTable { table: block.clone(), path }));
                    }
                    path.push(parent.to_owned());
                    next = parents.get(parent).and_then(Option::as_deref);
                }
            }
        }
        Ok(None)
    }
    fn get(&self, block: &str) -> Result<&Info, Error> {
        self.info.get(block).ok_or(Error::Contract("placement grammar owner"))
    }
    fn visible(&self, block: &str, parents: &Parents) -> Result<bool, Error> {
        let mut next = block;
        let mut seen = BTreeSet::new();
        loop {
            if !seen.insert(next) {
                return Err(Error::Contract("placement grammar cycle"));
            }
            if !self.get(next)?.active {
                return Ok(false);
            }
            if let Some(column) = &self.get(next)?.column {
                let table = parents
                    .get(next)
                    .and_then(Option::as_ref)
                    .and_then(|row| parents.get(row))
                    .and_then(Option::as_ref);
                if table
                    .and_then(|table| self.info.get(table))
                    .and_then(|info| info.columns.as_ref())
                    .is_none_or(|columns| !columns.contains(column))
                {
                    return Ok(false);
                }
            }
            match parents.get(next) {
                Some(Some(parent)) => {
                    match &self.get(parent)?.caption {
                        Caption::Original => {}
                        Caption::Selected(chosen) if chosen == next => {}
                        Caption::Absent | Caption::Selected(_) => return Ok(false),
                    }
                    next = parent;
                }
                Some(None) => return Ok(true),
                None => return Ok(false),
            }
        }
    }
}

fn allows(parent: Option<&str>, kind: &str) -> bool {
    match parent {
        None | Some("breditor/list-item") => super::escape::flow(kind),
        Some("breditor/table-cell") => kind != "breditor/table" && super::escape::flow(kind),
        Some("breditor/image") => kind == "breditor/paragraph",
        Some("breditor/table") => kind == "breditor/table-row",
        Some("breditor/table-row") => kind == "breditor/table-cell",
        Some("breditor/bullet-list" | "breditor/ordered-list") => kind == "breditor/list-item",
        _ => false,
    }
}
