use std::error::Error;

use crate::{
    codec::DocumentJsonCodec,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

pub(super) fn empty_session(lineage: &str) -> Result<EditorSession, Box<dyn Error>> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(
            r#"{
                "format":"breditor/document",
                "formatVersion":1,
                "schema":{"name":"breditor/base","version":1},
                "root":{
                    "kind":"element",
                    "type":"breditor/document",
                    "entityId":null,
                    "properties":{},
                    "children":[{
                        "kind":"element",
                        "type":"breditor/paragraph",
                        "entityId":null,
                        "properties":{},
                        "children":[]
                    }]
                }
            }"#,
        )?;
    let state = EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)?;
    Ok(EditorSession::new(state))
}
