//! Core semantic previews and exact AST comparison for shared paragraph lowerers.
use crate::Error;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};
use loro::LoroDoc;
use serde_json::Value;

pub(super) fn id(value: &str) -> Result<BlockId, Error> {
    BlockId::try_new(value).map_err(|_| Error::Contract("shared paragraph identity"))
}
pub(super) fn context(codec: &DocumentJsonCodecV2) -> EditorContext {
    EditorContext::new(codec.schema().clone(), codec.limits().clone())
}
pub(super) fn layout(root: &Value, block: &str) -> Result<(Option<String>, Option<String>), Error> {
    fn find(node: &Value, block: &str) -> Option<(Option<String>, Option<String>)> {
        let children = node.get("children")?.as_array()?;
        for (index, child) in children.iter().enumerate() {
            if child.pointer("/properties/breditor~1block-id").and_then(Value::as_str)
                == Some(block)
            {
                let parent = node
                    .pointer("/properties/breditor~1block-id")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                let before = children
                    .get(index + 1)
                    .and_then(|node| node.pointer("/properties/breditor~1block-id"))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                return Some((parent, before));
            }
            if let Some(value) = find(child, block) {
                return Some(value);
            }
        }
        None
    }
    find(root, block).ok_or(Error::Contract("visible shared paragraph layout"))
}
pub(super) fn verify(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    expected: &RichDocument,
) -> Result<(), Error> {
    doc.commit();
    let actual = super::materialize::envelope(doc)?;
    let admitted = codec
        .decode(&actual.to_string())
        .map_err(|_| Error::Contract("shared paragraph schema admission"))?;
    let actual = codec
        .encode(&admitted)
        .map_err(|_| Error::Contract("shared paragraph canonical encoding"))?;
    if actual
        != codec
            .encode(expected.document())
            .map_err(|_| Error::Contract("shared paragraph preview encoding"))?
    {
        return Err(Error::Contract("shared paragraph lowering differs from core semantics"));
    }
    Ok(())
}
