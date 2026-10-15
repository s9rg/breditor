//! A caption choice selects retained paragraph identity, never a copied AST or text register.
use super::{creation, model};
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde_json::{Value, json};

pub(super) fn prepare_parent(doc: &LoroDoc, parent: Option<&str>) -> Result<(), Error> {
    if let Some(parent) = parent
        && model::string(&model::metadata(doc, parent)?, "type")? == "breditor/image"
    {
        model::metadata(doc, parent)?
            .ensure_mergeable_map("effects")?
            .ensure_mergeable_map("image-caption")?;
    }
    Ok(())
}
pub(super) fn write(
    doc: &LoroDoc,
    image: &str,
    caption: Option<&str>,
    stamp: Stamp,
) -> Result<(), Error> {
    model::write_patch(
        doc,
        image,
        "image-caption",
        &model::Patch::set("$caption", json!(caption)),
        stamp,
    )
}
/// Generic insertion/move into an admitted empty image owns the same semantic choice.
pub(super) fn inserted(
    doc: &LoroDoc,
    parent: Option<&str>,
    block: &str,
    stamp: Stamp,
) -> Result<(), Error> {
    if let Some(parent) = parent
        && model::string(&model::metadata(doc, parent)?, "type")? == "breditor/image"
    {
        write(doc, parent, Some(block), stamp)?;
    }
    Ok(())
}
pub(super) fn project(children: &mut Vec<Value>, choice: Option<Value>) -> Result<(), Error> {
    if let Some(choice) = choice {
        if choice.is_null() {
            children.clear();
        } else {
            let id = choice.as_str().ok_or(Error::Contract("shared caption identity choice"))?;
            children.retain(|child| creation::block(child).ok() == Some(id));
        }
    }
    Ok(())
}
