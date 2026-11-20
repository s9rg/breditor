//! Four independent V3 owned fields, shared by genesis, births, edits and audit.
mod audit;
use super::{model, protocol::Protocol};
use crate::{Error, register::Stamp};
pub(super) use audit::validate;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayout,
        RichBlockLayoutPatch, RichDocument, RichLayoutChange, RichLineHeight,
    },
};
use loro::{LoroDoc, LoroMap};
use serde_json::{Map, Value, json};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Field {
    Alignment,
    Direction,
    Indent,
    LineHeight,
}
fn value_error<T>(_: T) -> Error {
    Error::Contract("shared layout value")
}
impl Field {
    pub const ALL: [Self; 4] = [Self::Alignment, Self::Direction, Self::Indent, Self::LineHeight];
    pub const fn name(self) -> &'static str {
        match self {
            Self::Alignment => "layout-alignment",
            Self::Direction => "layout-direction",
            Self::Indent => "layout-indent",
            Self::LineHeight => "layout-line-height",
        }
    }
    pub const fn property(self) -> &'static str {
        match self {
            Self::Alignment => "breditor/block-align",
            Self::Direction => "breditor/block-direction",
            Self::Indent => "breditor/block-indent",
            Self::LineHeight => "breditor/line-height-percent",
        }
    }
    pub fn named(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|f| f.name() == name)
    }
    pub fn validate_value(self, value: &Value) -> Result<(), Error> {
        let integer = value.as_u64().ok_or(Error::Contract("shared layout integer"))?;
        match self {
            Self::Alignment => {
                RichBlockAlignment::try_from(u8::try_from(integer).map_err(value_error)?)
                    .map_err(value_error)?;
            }
            Self::Direction => {
                RichBlockDirection::try_from(u8::try_from(integer).map_err(value_error)?)
                    .map_err(value_error)?;
            }
            Self::Indent => {
                RichBlockIndent::try_new(u8::try_from(integer).map_err(value_error)?)
                    .map_err(value_error)?;
            }
            Self::LineHeight => {
                RichLineHeight::try_new(u16::try_from(integer).map_err(value_error)?)
                    .map_err(value_error)?;
            }
        }
        Ok(())
    }
    pub fn write(
        self,
        doc: &LoroDoc,
        block: &str,
        value: Option<Value>,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let patch = if let Some(value) = value {
            self.validate_value(&value)?;
            model::Patch::set(self.property(), value)
        } else {
            model::Patch {
                sets: std::collections::BTreeMap::new(),
                removes: vec![self.property().into()],
            }
        };
        model::write_patch(doc, block, self.name(), &patch, stamp)
    }
}
pub(super) fn is_property(name: &str) -> bool {
    Field::ALL.into_iter().any(|field| field.property() == name)
}
pub(super) fn enabled(doc: &LoroDoc) -> Result<bool, Error> {
    Ok(Protocol::read(doc)?.layout())
}
pub(super) fn prepare_all(effects: &LoroMap) -> Result<(), Error> {
    for field in Field::ALL {
        effects.ensure_mergeable_map(field.name())?;
    }
    Ok(())
}
pub(super) fn strip_defaults(properties: &mut Map<String, Value>) {
    for field in Field::ALL {
        properties.remove(field.property());
    }
}
pub(super) fn seed(
    effects: &LoroMap,
    properties: &mut Map<String, Value>,
    stamp: Stamp,
) -> Result<(), Error> {
    prepare_all(effects)?;
    for field in Field::ALL {
        if let Some(value) = properties.remove(field.property()) {
            field.validate_value(&value)?;
            crate::register::write(
                effects,
                field.name(),
                stamp,
                serde_json::to_string(&model::Patch::set(field.property(), value))?.into(),
            )?;
        }
    }
    Ok(())
}
pub(super) fn publish_node(doc: &LoroDoc, node: &Value, stamp: Stamp) -> Result<(), Error> {
    if !enabled(doc)? {
        return Ok(());
    }
    let properties =
        node["properties"].as_object().ok_or(Error::Contract("shared layout birth properties"))?;
    let block = super::creation::block(node)?;
    for field in Field::ALL {
        if let Some(value) = properties.get(field.property()) {
            field.write(doc, block, Some(value.clone()), stamp)?;
        }
    }
    Ok(())
}
pub(super) fn changes(patch: RichBlockLayoutPatch) -> Vec<(Field, Option<Value>)> {
    let mut out = vec![];
    change(&mut out, Field::Alignment, patch.alignment(), RichBlockAlignment::code);
    change(&mut out, Field::Direction, patch.direction(), RichBlockDirection::code);
    change(&mut out, Field::Indent, patch.indent(), RichBlockIndent::get);
    change(&mut out, Field::LineHeight, patch.line_height(), RichLineHeight::get);
    out
}
fn change<T, U: serde::Serialize>(
    out: &mut Vec<(Field, Option<Value>)>,
    field: Field,
    change: RichLayoutChange<T>,
    value: impl FnOnce(T) -> U,
) {
    match change {
        RichLayoutChange::Keep => {}
        RichLayoutChange::Clear => out.push((field, None)),
        RichLayoutChange::Set(v) => out.push((field, Some(json!(value(v))))),
    }
}
pub(super) fn inherit_split(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    after: &RichDocument,
    block: &str,
    stamp: Stamp,
) -> Result<(), Error> {
    if !enabled(doc)? {
        return Ok(());
    }
    let value = RichBlockLayout::read(
        &super::paragraphs::context(codec),
        after,
        &super::paragraphs::id(block)?,
    )
    .map_err(|_| Error::Contract("shared split layout source"))?;
    for (field, value) in [
        (Field::Alignment, value.alignment().map(|v| json!(v.code()))),
        (Field::Direction, value.direction().map(|v| json!(v.code()))),
        (Field::Indent, value.indent().map(|v| json!(v.get()))),
        (Field::LineHeight, value.line_height().map(|v| json!(v.get()))),
    ] {
        if let Some(value) = value {
            field.write(doc, block, Some(value), stamp)?;
        }
    }
    Ok(())
}
