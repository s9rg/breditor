//! Shared builders and assertions for black-box core contract tests.

#![allow(dead_code)]

use std::{error::Error, io};

use breditor_core::{
    codec::{CodecErrorCode, DocumentCodecError, DocumentJsonCodec},
    position::NodePath,
    schema::{CompiledSchema, ValidationCode},
};
use serde_json::{Value, json};

pub(crate) mod local_log;
pub(crate) mod local_log_tail;

pub(crate) type TestResult = Result<(), Box<dyn Error>>;

pub(crate) fn codec() -> DocumentJsonCodec {
    DocumentJsonCodec::new(CompiledSchema::breditor_base())
}

pub(crate) fn text_node(text: &str, strong: bool) -> Value {
    let formats = if strong {
        vec![json!({ "type": "breditor/strong", "properties": {} })]
    } else {
        Vec::new()
    };
    json!({ "kind": "text", "text": text, "formats": formats })
}

pub(crate) fn paragraph(children: &[Value]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": children,
    })
}

pub(crate) fn document_with_root(root: &Value) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 1,
        "schema": { "name": "breditor/base", "version": 1 },
        "root": root,
    })
    .to_string()
}

pub(crate) fn document_json(paragraphs: &[Value]) -> String {
    document_with_root(&json!({
        "kind": "element",
        "type": "breditor/document",
        "entityId": null,
        "properties": {},
        "children": paragraphs,
    }))
}

pub(crate) fn minimal_document_json() -> String {
    document_json(&[paragraph(&[])])
}

pub(crate) fn fixture_document_json() -> String {
    document_json(&[paragraph(&[text_node("a😀b", false), text_node("x", true)]), paragraph(&[])])
}

pub(crate) fn path(indices: &[u32]) -> Result<NodePath, Box<dyn Error>> {
    NodePath::try_from_indices(indices.to_vec()).map_err(Into::into)
}

pub(crate) fn test_error(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}

pub(crate) fn assert_codec_error_code(json: &str, expected: CodecErrorCode) -> TestResult {
    let Err(error) = codec().decode(json) else {
        return Err(
            test_error(format!("expected codec error {expected:?} for input {json}")).into()
        );
    };
    assert_eq!(error.code(), expected);
    Ok(())
}

pub(crate) fn assert_validation_issue(
    json: &str,
    expected_code: ValidationCode,
    expected_path: &[u32],
) -> TestResult {
    let Err(error) = codec().decode(json) else {
        return Err(test_error(format!("expected validation issue {expected_code:?}")).into());
    };
    let DocumentCodecError::Validation(report) = error else {
        return Err(test_error(format!(
            "expected validation issue {expected_code:?}, got codec error {error}"
        ))
        .into());
    };
    let expected_path = path(expected_path)?;
    assert!(
        report.iter().any(|issue| issue.code() == expected_code && issue.path() == &expected_path),
        "missing {expected_code:?} at {expected_path:?} in {report:?}"
    );
    Ok(())
}
