//! Black-box contracts for the strict, versioned operation JSON boundary.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, OPERATION_FORMAT, OPERATION_FORMAT_VERSION, OperationCodecError,
        OperationFragmentField, OperationJsonCodec, OperationOffsetField, OperationPathField,
        OperationRecordErrorCode, OperationRecordLocation,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, OperationKind, OperationPathRole, OperationValidationError, ParagraphJoin,
        ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace, TextRange, TextSplice,
    },
    position::{MAX_PATH_DEPTH, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const TEXT_SPLICE_JSON: &str = concat!(
    r#"{"format":"breditor/operation","formatVersion":1,"schema":{"name":"breditor/base","version":1},"operation":{"kind":"textSplice","range":{"containerPath":[0],"start":1,"end":3},"expectedRemoved":{"runs":[{"text":"😀","formats":[]}]},"replacement":{"runs":[{"text":"é","formats":[]},{"text":"e"#,
    "\u{301}",
    r#"","formats":[{"type":"breditor/strong","properties":{}}]}]}}}"#,
);

const PARAGRAPH_SPLIT_JSON: &str = concat!(
    r#"{"format":"breditor/operation","formatVersion":1,"schema":{"name":"breditor/base","version":1},"operation":{"kind":"paragraphSplit","paragraphPath":[0],"offset":2,"expected":{"runs":[{"text":"😀","formats":[{"type":"breditor/strong","properties":{}}]},{"text":"e"#,
    "\u{301}",
    r#"","formats":[]}]}}}"#,
);

const PARAGRAPH_JOIN_JSON: &str = concat!(
    r#"{"format":"breditor/operation","formatVersion":1,"schema":{"name":"breditor/base","version":1},"operation":{"kind":"paragraphJoin","leftPath":[1],"expectedLeft":{"runs":[]},"expectedRight":{"runs":[{"text":"e"#,
    "\u{301}",
    r#"🚀","formats":[{"type":"breditor/strong","properties":{}}]}]}}}"#,
);

const ROOT_TEXT_REPLACE_JSON: &str = concat!(
    r#"{"format":"breditor/operation","formatVersion":1,"schema":{"name":"breditor/base","version":1},"operation":{"kind":"rootTextReplace","range":{"start":{"paragraphPath":[0],"offset":1},"end":{"paragraphPath":[1],"offset":2}},"expectedParagraphs":[{"runs":[{"text":"a😀","formats":[]}]},{"runs":[{"text":"e"#,
    "\u{301}",
    r#"","formats":[]}]}],"replacementParagraphs":[{"runs":[]},{"runs":[{"text":"🚀","formats":[{"type":"breditor/strong","properties":{}}]}]}]}}"#,
);

fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn formats(strong: bool) -> Result<FormatSet, Box<dyn Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])
    .map_err(Into::into)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, strong)| -> Result<TextRun, Box<dyn Error>> {
                TextRun::try_new(*text, formats(*strong)?).map_err(Into::into)
            })
            .collect::<Result<Vec<_>, _>>()?,
    )
    .map_err(Into::into)
}

fn text_range(container_path: &[u32], start: u64, end: u64) -> Result<TextRange, Box<dyn Error>> {
    TextRange::try_new(path(container_path)?, offset(start)?, offset(end)?).map_err(Into::into)
}

fn root_range(
    start_paragraph: u32,
    start_offset: u64,
    end_paragraph: u32,
    end_offset: u64,
) -> Result<RootTextRange, Box<dyn Error>> {
    let start = RootTextBoundary::try_new(path(&[start_paragraph])?, offset(start_offset)?)?;
    let end = RootTextBoundary::try_new(path(&[end_paragraph])?, offset(end_offset)?)?;
    RootTextRange::try_new(start, end).map_err(Into::into)
}

fn golden_operations() -> Result<Vec<(&'static str, Operation)>, Box<dyn Error>> {
    Ok(vec![
        (
            TEXT_SPLICE_JSON,
            TextSplice::try_new(
                text_range(&[0], 1, 3)?,
                fragment(&[("😀", false)])?,
                fragment(&[("é", false), ("e\u{301}", true)])?,
            )?
            .into(),
        ),
        (
            PARAGRAPH_SPLIT_JSON,
            ParagraphSplit::try_new(
                path(&[0])?,
                offset(2)?,
                fragment(&[("😀", true), ("e\u{301}", false)])?,
            )?
            .into(),
        ),
        (
            PARAGRAPH_JOIN_JSON,
            ParagraphJoin::try_new(
                path(&[1])?,
                TextFragment::empty(),
                fragment(&[("e\u{301}🚀", true)])?,
            )?
            .into(),
        ),
        (
            ROOT_TEXT_REPLACE_JSON,
            RootTextReplace::try_new(
                root_range(0, 1, 1, 2)?,
                vec![fragment(&[("a😀", false)])?, fragment(&[("e\u{301}", false)])?],
                vec![TextFragment::empty(), fragment(&[("🚀", true)])?],
            )?
            .into(),
        ),
    ])
}

fn rejected(
    codec: &OperationJsonCodec,
    input: &str,
) -> Result<OperationCodecError, Box<dyn Error>> {
    match codec.decode(input) {
        Ok(_) => Err(test_error("invalid operation JSON unexpectedly decoded").into()),
        Err(error) => Ok(error),
    }
}

fn assert_rejected(codec: &OperationJsonCodec, input: &str) -> TestResult {
    rejected(codec, input).map(|_| ())
}

fn assert_rejected_code(
    codec: &OperationJsonCodec,
    input: &str,
    expected: CodecErrorCode,
) -> TestResult {
    assert_eq!(rejected(codec, input)?.code(), expected);
    Ok(())
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = breditor_core::codec::DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn assert_apply_equivalent(
    context: &EditorContext,
    source: &EditorState,
    operation: Operation,
) -> TestResult {
    let codec = OperationJsonCodec::new(context.clone());
    let decoded = codec.decode(&codec.encode(&operation)?)?;
    assert_eq!(decoded, operation);

    let original = Transaction::new(source, vec![operation]).apply(context, source)?;
    let replayed = Transaction::new(source, vec![decoded]).apply(context, source)?;
    assert_eq!(replayed, original);

    let commit = replayed
        .commit()
        .ok_or_else(|| test_error("changed operation unexpectedly produced no commit"))?;
    let decoded_inverses = commit
        .inverse_operations()
        .iter()
        .map(|inverse| codec.encode(inverse).and_then(|json| codec.decode(&json)))
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(decoded_inverses, commit.inverse_operations());
    let restored =
        Transaction::new(commit.after(), decoded_inverses).apply(context, commit.after())?;
    let restored = restored
        .commit()
        .ok_or_else(|| test_error("inverse operation unexpectedly produced no commit"))?;
    assert_eq!(restored.after().document(), source.document());
    Ok(())
}

fn assert_record_error(
    codec: &OperationJsonCodec,
    input: &str,
    expected_code: OperationRecordErrorCode,
    expected_code_string: &str,
    expected_location: &OperationRecordLocation,
) -> TestResult {
    let error = rejected(codec, input)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidOperation);
    assert_eq!(error.code().as_str(), "codec.invalid_operation");
    match error {
        OperationCodecError::InvalidOperation(error) => {
            assert_eq!(error.code(), expected_code);
            assert_eq!(error.code().as_str(), expected_code_string);
            assert_eq!(error.location(), expected_location);
        }
        other => return Err(test_error(format!("expected invalid operation; got {other}")).into()),
    }
    Ok(())
}

fn operation_mutation(
    source: &str,
    mutate: impl FnOnce(&mut serde_json::Map<String, Value>),
) -> Result<String, Box<dyn Error>> {
    let mut value = serde_json::from_str::<Value>(source)?;
    let operation = value
        .get_mut("operation")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| test_error("golden operation fixture has no operation object"))?;
    mutate(operation);
    serde_json::to_string(&value).map_err(Into::into)
}

#[test]
fn every_operation_kind_round_trips_to_exact_compact_versioned_json() -> TestResult {
    assert_eq!(OPERATION_FORMAT, "breditor/operation");
    assert_eq!(OPERATION_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let codec = OperationJsonCodec::new(context.clone());
    assert_eq!(codec.context(), &context);

    for (expected_json, operation) in golden_operations()? {
        let encoded = codec.encode(&operation)?;
        assert_eq!(encoded, expected_json);
        assert_eq!(codec.decode(&encoded)?, operation);
        assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    }
    Ok(())
}

#[test]
fn insignificant_json_order_whitespace_and_unicode_escapes_canonicalize_on_encode() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());
    let reordered_and_escaped = r#"
        {
          "operation": {
            "replacement": {
              "runs": [
                {"formats": [], "text": "\u00e9"},
                {"formats": [{"properties": {}, "type": "breditor/strong"}], "text": "e\u0301"}
              ]
            },
            "expectedRemoved": {"runs": [{"formats": [], "text": "\ud83d\ude00"}]},
            "range": {"end": 3, "start": 1, "containerPath": [0]},
            "kind": "textSplice"
          },
          "schema": {"version": 1, "name": "breditor/base"},
          "formatVersion": 1,
          "format": "breditor/operation"
        }
    "#;
    let decoded = codec.decode(reordered_and_escaped)?;
    assert_eq!(codec.encode(&decoded)?, TEXT_SPLICE_JSON);
    Ok(())
}

#[test]
fn envelope_and_variant_shapes_fail_closed() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());
    assert_rejected_code(
        &codec,
        &TEXT_SPLICE_JSON.replacen("breditor/operation", "other/operation", 1),
        CodecErrorCode::UnsupportedFormat,
    )?;
    assert_rejected_code(
        &codec,
        &TEXT_SPLICE_JSON.replacen(r#""formatVersion":1"#, r#""formatVersion":2"#, 1),
        CodecErrorCode::UnsupportedFormatVersion,
    )?;
    assert_rejected_code(
        &codec,
        &TEXT_SPLICE_JSON.replacen("breditor/base", "other/base", 1),
        CodecErrorCode::SchemaMismatch,
    )?;
    assert_rejected_code(
        &codec,
        &TEXT_SPLICE_JSON.replacen(
            r#""name":"breditor/base","version":1"#,
            r#""name":"breditor/base","version":0"#,
            1,
        ),
        CodecErrorCode::InvalidSchemaVersion,
    )?;
    let invalid_schema_name =
        rejected(&codec, &TEXT_SPLICE_JSON.replacen("breditor/base", "Invalid", 1))?;
    assert_eq!(invalid_schema_name.code(), CodecErrorCode::InvalidSchemaName);
    assert_eq!(invalid_schema_name.code().as_str(), "codec.invalid_schema_name");

    let unknown_envelope =
        TEXT_SPLICE_JSON.replacen(r#""operation":"#, r#""unknown":true,"operation":"#, 1);
    assert_rejected_code(&codec, &unknown_envelope, CodecErrorCode::InvalidJson)?;

    let duplicate_format = TEXT_SPLICE_JSON.replacen(
        r#""format":"breditor/operation""#,
        r#""format":"breditor/operation","format":"breditor/operation""#,
        1,
    );
    assert_rejected_code(&codec, &duplicate_format, CodecErrorCode::InvalidJson)?;

    let missing_operation = serde_json::to_string(&json!({
        "format": "breditor/operation",
        "formatVersion": 1,
        "schema": { "name": "breditor/base", "version": 1 },
    }))?;
    assert_rejected_code(&codec, &missing_operation, CodecErrorCode::InvalidJson)?;

    let duplicate_kind = TEXT_SPLICE_JSON.replacen(
        r#""kind":"textSplice""#,
        r#""kind":"textSplice","kind":"textSplice""#,
        1,
    );
    assert_rejected_code(&codec, &duplicate_kind, CodecErrorCode::InvalidJson)?;

    for kind in ["TextSplice", "textsplice", "unknown"] {
        assert_rejected_code(
            &codec,
            &TEXT_SPLICE_JSON.replacen("textSplice", kind, 1),
            CodecErrorCode::InvalidJson,
        )?;
    }

    let missing_range = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.remove("range");
    })?;
    assert_rejected_code(&codec, &missing_range, CodecErrorCode::InvalidJson)?;

    let unknown_variant_field = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.insert("unknown".to_owned(), Value::Bool(true));
    })?;
    assert_rejected_code(&codec, &unknown_variant_field, CodecErrorCode::InvalidJson)?;

    let nested_shape_failures = [
        TEXT_SPLICE_JSON.replacen(r#""end":3}"#, r#""end":3,"derived":0}"#, 1),
        TEXT_SPLICE_JSON.replacen(
            r#""containerPath":[0]"#,
            r#""containerPath":[0],"containerPath":[0]"#,
            1,
        ),
        TEXT_SPLICE_JSON.replacen(
            r#""expectedRemoved":{"runs":"#,
            r#""expectedRemoved":{"unknown":true,"runs":"#,
            1,
        ),
        TEXT_SPLICE_JSON.replacen(r#""text":"😀""#, r#""text":"😀","text":"😀""#, 1),
        TEXT_SPLICE_JSON.replacen(r#""text":"😀","formats":[]"#, r#""text":"😀""#, 1),
        TEXT_SPLICE_JSON.replacen(
            r#""type":"breditor/strong","properties":{}"#,
            r#""type":"breditor/strong","unknown":true,"properties":{}"#,
            1,
        ),
        TEXT_SPLICE_JSON.replacen(
            r#""expectedRemoved":{"runs":"#,
            r#""expectedRemoved":{"utf16Length":2,"runs":"#,
            1,
        ),
        ROOT_TEXT_REPLACE_JSON.replacen(
            r#""paragraphPath":[0],"offset":1"#,
            r#""paragraphPath":[0],"offset":1,"unknown":true"#,
            1,
        ),
    ];
    for input in nested_shape_failures {
        assert_rejected_code(&codec, &input, CodecErrorCode::InvalidJson)?;
    }
    Ok(())
}

#[test]
fn malformed_numbers_paths_ranges_and_constructor_contracts_are_rejected() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());

    for invalid_number in ["-1", "1.0", "1.5", "1e0", r#""1""#, "null", "9007199254740992"] {
        let input =
            TEXT_SPLICE_JSON.replacen(r#""start":1"#, &format!(r#""start":{invalid_number}"#), 1);
        assert_rejected(&codec, &input)?;
    }
    assert_rejected(&codec, &TEXT_SPLICE_JSON.replacen("[0]", "[4294967296]", 1))?;

    let deep_path = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 1])?;
    assert_rejected(&codec, &TEXT_SPLICE_JSON.replacen("[0]", &deep_path, 1))?;

    let reversed_splice = TEXT_SPLICE_JSON.replacen(r#""start":1"#, r#""start":4"#, 1);
    assert_rejected(&codec, &reversed_splice)?;
    let mismatched_guard = TEXT_SPLICE_JSON.replacen(r#""end":3"#, r#""end":2"#, 1);
    assert_rejected(&codec, &mismatched_guard)?;

    assert_rejected(
        &codec,
        &PARAGRAPH_SPLIT_JSON.replacen(r#""paragraphPath":[0]"#, r#""paragraphPath":[0,0]"#, 1),
    )?;
    assert_rejected(&codec, &PARAGRAPH_SPLIT_JSON.replacen(r#""offset":2"#, r#""offset":1"#, 1))?;
    assert_rejected(
        &codec,
        &PARAGRAPH_JOIN_JSON.replacen(r#""leftPath":[1]"#, r#""leftPath":[]"#, 1),
    )?;
    assert_rejected(
        &codec,
        &PARAGRAPH_JOIN_JSON.replacen(r#""leftPath":[1]"#, r#""leftPath":[4294967295]"#, 1),
    )?;
    assert_rejected(
        &codec,
        &ROOT_TEXT_REPLACE_JSON.replacen(
            r#""paragraphPath":[0],"offset":1"#,
            r#""paragraphPath":[2],"offset":1"#,
            1,
        ),
    )?;
    assert_rejected(
        &codec,
        &ROOT_TEXT_REPLACE_JSON.replacen(
            concat!(
                r#""expectedParagraphs":[{"runs":[{"text":"a😀","formats":[]}]},{"runs":[{"text":"e"#,
                "\u{301}",
                r#"","formats":[]}]}]"#,
            ),
            r#""expectedParagraphs":[{"runs":[{"text":"a😀","formats":[]}]}]"#,
            1,
        ),
    )?;
    assert_rejected(
        &codec,
        &ROOT_TEXT_REPLACE_JSON.replacen(
            r#""replacementParagraphs":[{"runs":[]},{"runs":[{"text":"🚀","formats":[{"type":"breditor/strong","properties":{}}]}]}]"#,
            r#""replacementParagraphs":[]"#,
            1,
        ),
    )?;
    Ok(())
}

#[test]
fn structural_path_record_error_subcodes_and_locations_are_stable() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());

    let deep_path = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 1])?;
    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen("[0]", &deep_path, 1),
        OperationRecordErrorCode::InvalidPath,
        "operation_record.invalid_path",
        &OperationRecordLocation::Path(OperationPathField::TextSpliceContainer),
    )?;
    assert_record_error(
        &codec,
        &PARAGRAPH_SPLIT_JSON.replacen(r#""paragraphPath":[0]"#, r#""paragraphPath":[0,0]"#, 1),
        OperationRecordErrorCode::InvalidPath,
        "operation_record.invalid_path",
        &OperationRecordLocation::Path(OperationPathField::ParagraphSplitParagraph),
    )?;
    for invalid_left_path in ["[]", "[4294967295]"] {
        assert_record_error(
            &codec,
            &PARAGRAPH_JOIN_JSON.replacen(
                r#""leftPath":[1]"#,
                &format!(r#""leftPath":{invalid_left_path}"#),
                1,
            ),
            OperationRecordErrorCode::InvalidPath,
            "operation_record.invalid_path",
            &OperationRecordLocation::Path(OperationPathField::ParagraphJoinLeft),
        )?;
    }
    Ok(())
}

#[test]
fn record_error_subcodes_and_locations_are_stable() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());

    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen(r#""start":1"#, r#""start":9007199254740992"#, 1),
        OperationRecordErrorCode::InvalidOffset,
        "operation_record.invalid_offset",
        &OperationRecordLocation::Offset(OperationOffsetField::TextSpliceStart),
    )?;
    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen("breditor/strong", "InvalidFormat", 1),
        OperationRecordErrorCode::InvalidFormatName,
        "operation_record.invalid_format_name",
        &OperationRecordLocation::Format {
            field: OperationFragmentField::TextSpliceReplacement,
            paragraph_index: 0,
            run_index: 1,
            format_index: 0,
        },
    )?;

    let duplicate_formats = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.insert(
            "replacement".to_owned(),
            json!({
                "runs": [{
                    "text": "x",
                    "formats": [
                        { "type": "breditor/strong", "properties": {} },
                        { "type": "breditor/strong", "properties": {} },
                    ],
                }],
            }),
        );
    })?;
    assert_record_error(
        &codec,
        &duplicate_formats,
        OperationRecordErrorCode::NonCanonicalFormats,
        "operation_record.noncanonical_formats",
        &OperationRecordLocation::Run {
            field: OperationFragmentField::TextSpliceReplacement,
            paragraph_index: 0,
            run_index: 0,
        },
    )?;

    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen(r#""text":"😀""#, r#""text":"""#, 1),
        OperationRecordErrorCode::InvalidTextRun,
        "operation_record.invalid_text_run",
        &OperationRecordLocation::Run {
            field: OperationFragmentField::TextSpliceExpectedRemoved,
            paragraph_index: 0,
            run_index: 0,
        },
    )?;

    let adjacent_equal_formats = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.insert(
            "replacement".to_owned(),
            json!({
                "runs": [
                    { "text": "a", "formats": [] },
                    { "text": "b", "formats": [] },
                ],
            }),
        );
    })?;
    assert_record_error(
        &codec,
        &adjacent_equal_formats,
        OperationRecordErrorCode::NonCanonicalFragment,
        "operation_record.noncanonical_fragment",
        &OperationRecordLocation::Fragment {
            field: OperationFragmentField::TextSpliceReplacement,
            paragraph_index: 0,
        },
    )?;

    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen(r#""start":1"#, r#""start":4"#, 1),
        OperationRecordErrorCode::InvalidRange,
        "operation_record.invalid_range",
        &OperationRecordLocation::Operation(OperationKind::TextSplice),
    )?;
    assert_record_error(
        &codec,
        &TEXT_SPLICE_JSON.replacen(r#""end":3"#, r#""end":2"#, 1),
        OperationRecordErrorCode::ContractViolation,
        "operation_record.contract_violation",
        &OperationRecordLocation::Operation(OperationKind::TextSplice),
    )?;
    assert_record_error(
        &codec,
        &PARAGRAPH_SPLIT_JSON.replacen(r#""offset":2"#, r#""offset":1"#, 1),
        OperationRecordErrorCode::ContractViolation,
        "operation_record.contract_violation",
        &OperationRecordLocation::Operation(OperationKind::ParagraphSplit),
    )?;
    Ok(())
}

#[test]
fn fragments_must_be_unicode_valid_canonical_and_schema_valid() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());

    let unpaired_surrogate = TEXT_SPLICE_JSON.replacen("😀", r"\uD800", 1);
    assert_rejected_code(&codec, &unpaired_surrogate, CodecErrorCode::InvalidJson)?;

    let empty_run = TEXT_SPLICE_JSON.replacen(r#""text":"😀""#, r#""text":"""#, 1);
    assert_rejected(&codec, &empty_run)?;

    let adjacent_equal_formats = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.insert(
            "replacement".to_owned(),
            json!({
                "runs": [
                    { "text": "a", "formats": [] },
                    { "text": "b", "formats": [] },
                ],
            }),
        );
    })?;
    assert_rejected(&codec, &adjacent_equal_formats)?;

    let duplicate_formats = operation_mutation(TEXT_SPLICE_JSON, |operation| {
        operation.insert(
            "replacement".to_owned(),
            json!({
                "runs": [{
                    "text": "x",
                    "formats": [
                        { "type": "breditor/strong", "properties": {} },
                        { "type": "breditor/strong", "properties": {} },
                    ],
                }],
            }),
        );
    })?;
    assert_rejected(&codec, &duplicate_formats)?;

    let unsupported_format =
        TEXT_SPLICE_JSON.replacen(r#""type":"breditor/strong""#, r#""type":"other/format""#, 1);
    assert_rejected(&codec, &unsupported_format)?;

    let format_properties = TEXT_SPLICE_JSON.replacen(
        r#""type":"breditor/strong","properties":{}"#,
        r#""type":"breditor/strong","properties":{"breditor/value":true}"#,
        1,
    );
    assert_rejected_code(&codec, &format_properties, CodecErrorCode::InvalidJson)?;

    let nested_format_properties = TEXT_SPLICE_JSON.replacen(
        r#""type":"breditor/strong","properties":{}"#,
        r#""type":"breditor/strong","properties":{"breditor/value":[[[[true]]]]}"#,
        1,
    );
    assert_rejected_code(&codec, &nested_format_properties, CodecErrorCode::InvalidJson)?;
    Ok(())
}

#[test]
fn context_limits_apply_to_decode_and_to_runtime_values_before_encode() -> TestResult {
    let default_context = EditorContext::default();
    let default_codec = OperationJsonCodec::new(default_context);
    let text_splice = golden_operations()?
        .into_iter()
        .next()
        .ok_or_else(|| test_error("golden operation list is empty"))?
        .1;
    let encoded = default_codec.encode(&text_splice)?;

    let json_limited_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    );
    let json_limited = OperationJsonCodec::new(json_limited_context);
    assert_rejected_code(&json_limited, &encoded, CodecErrorCode::InputTooLarge)?;
    let output_error = json_limited.encode(&text_splice).map_or_else(Ok, |_| {
        Err(test_error("oversized operation encoding unexpectedly succeeded"))
    })?;
    assert_eq!(output_error.code(), CodecErrorCode::OutputTooLarge);
    assert_eq!(output_error.code().as_str(), "codec.output_too_large");
    match output_error {
        OperationCodecError::OutputTooLarge { actual, maximum } => {
            assert_eq!(actual, encoded.len());
            assert_eq!(maximum, encoded.len() - 1);
        }
        other => return Err(test_error(format!("expected output-too-large; got {other}")).into()),
    }

    let exact_json_codec = OperationJsonCodec::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    ));
    assert_eq!(exact_json_codec.encode(&text_splice)?, encoded);
    assert_eq!(exact_json_codec.decode(&encoded)?, text_splice);

    let depth_limited = OperationJsonCodec::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_node_depth(0),
    ));
    let decode_error = rejected(&depth_limited, &encoded)?;
    let encode_error = depth_limited
        .encode(&text_splice)
        .map_or_else(Ok, |_| Err(test_error("depth-invalid operation unexpectedly encoded")))?;
    for error in [decode_error, encode_error] {
        assert_eq!(error.code(), CodecErrorCode::ValidationFailed);
        assert_eq!(error.code().as_str(), "codec.validation_failed");
        match error {
            OperationCodecError::Validation(OperationValidationError::PathDepthLimit {
                kind,
                role,
                actual,
                maximum,
            }) => {
                assert_eq!(kind, OperationKind::TextSplice);
                assert_eq!(role, OperationPathRole::TextContainer);
                assert_eq!(actual, 1);
                assert_eq!(maximum, 0);
            }
            other => {
                return Err(test_error(format!(
                    "expected exact path-depth validation error; got {other}"
                ))
                .into());
            }
        }
    }

    let cases = [
        DocumentLimits::default().with_max_children_per_element(1),
        DocumentLimits::default().with_max_text_bytes(3),
        DocumentLimits::default().with_max_total_text_bytes(3),
        DocumentLimits::default().with_max_formats_per_text(0),
    ];
    for limits in cases {
        let codec =
            OperationJsonCodec::new(EditorContext::new(CompiledSchema::breditor_base(), limits));
        assert_rejected(&codec, &encoded)?;
        assert!(codec.encode(&text_splice).is_err());
    }
    Ok(())
}

#[test]
fn allocation_preflight_bounds_owned_payloads_without_hiding_first_limit_errors() -> TestResult {
    let text_codec = OperationJsonCodec::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(1),
    ));
    let operation_json = |text: &str| {
        serde_json::to_string(&json!({
            "format": "breditor/operation",
            "formatVersion": 1,
            "schema": { "name": "breditor/base", "version": 1 },
            "operation": {
                "kind": "textSplice",
                "range": { "containerPath": [0], "start": 0, "end": text.len() },
                "expectedRemoved": { "runs": [{ "text": text, "formats": [] }] },
                "replacement": { "runs": [] },
            },
        }))
    };

    let first_excess = operation_json("ab")?;
    assert_rejected_code(&text_codec, &first_excess, CodecErrorCode::ValidationFailed)?;
    let larger_excess = operation_json("abc")?;
    assert_rejected_code(&text_codec, &larger_excess, CodecErrorCode::InvalidJson)?;

    let paragraph_codec = OperationJsonCodec::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(1),
    ));
    assert_rejected_code(
        &paragraph_codec,
        ROOT_TEXT_REPLACE_JSON,
        CodecErrorCode::ValidationFailed,
    )?;
    let mut larger_paragraph_slice = serde_json::from_str::<Value>(ROOT_TEXT_REPLACE_JSON)?;
    let expected = larger_paragraph_slice
        .pointer_mut("/operation/expectedParagraphs")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| test_error("root replacement fixture has no expected paragraph slice"))?;
    expected.push(json!({ "runs": [] }));
    assert_rejected_code(
        &paragraph_codec,
        &serde_json::to_string(&larger_paragraph_slice)?,
        CodecErrorCode::InvalidJson,
    )?;

    let mut wrong_schema = serde_json::from_str::<Value>(&larger_excess)?;
    *wrong_schema
        .pointer_mut("/schema/name")
        .ok_or_else(|| test_error("operation fixture has no schema name"))? =
        Value::String("other/base".to_owned());
    assert_rejected_code(
        &text_codec,
        &serde_json::to_string(&wrong_schema)?,
        CodecErrorCode::SchemaMismatch,
    )?;
    Ok(())
}

#[test]
fn decoded_operations_replay_with_exactly_the_same_transaction_result() -> TestResult {
    let context = EditorContext::default();

    let splice_source = state(
        &context,
        &[paragraph(&[text_node("a😀", false), text_node("Z", true)])],
        "operation-json-splice",
    )?;
    let splice = TextSplice::capture(
        &context,
        splice_source.document(),
        text_range(&[0], 1, 3)?,
        fragment(&[("é", true), ("e\u{301}", false)])?,
    )?;
    assert_apply_equivalent(&context, &splice_source, splice.into())?;

    let split_source = state(
        &context,
        &[paragraph(&[text_node("a😀", false), text_node("e\u{301}", true)])],
        "operation-json-split",
    )?;
    let split =
        ParagraphSplit::capture(&context, split_source.document(), path(&[0])?, offset(3)?)?;
    assert_apply_equivalent(&context, &split_source, split.into())?;

    let join_source = state(
        &context,
        &[paragraph(&[text_node("a", false)]), paragraph(&[text_node("😀", true)])],
        "operation-json-join",
    )?;
    let join = ParagraphJoin::capture(&context, join_source.document(), path(&[0])?)?;
    assert_apply_equivalent(&context, &join_source, join.into())?;

    let root_source = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("😀c", true)])],
        "operation-json-root-replace",
    )?;
    let root_replace = RootTextReplace::capture(
        &context,
        root_source.document(),
        root_range(0, 1, 1, 2)?,
        vec![TextFragment::empty(), fragment(&[("e\u{301}", false)])?],
    )?;
    assert_apply_equivalent(&context, &root_source, root_replace.into())?;
    Ok(())
}

#[test]
fn stale_guards_remain_application_errors_not_codec_errors() -> TestResult {
    let context = EditorContext::default();
    let codec = OperationJsonCodec::new(context.clone());
    let source =
        state(&context, &[paragraph(&[text_node("a😀", false)])], "operation-json-stale-guard")?;
    let stale = TextSplice::try_new(
        text_range(&[0], 1, 3)?,
        fragment(&[("XY", false)])?,
        TextFragment::empty(),
    )?;

    let decoded = codec.decode(&codec.encode(&stale.clone().into())?)?;
    assert!(Transaction::new(&source, vec![decoded]).apply(&context, &source).is_err());
    assert!(Transaction::new(&source, vec![stale.into()]).apply(&context, &source).is_err());
    Ok(())
}

#[test]
fn operation_records_are_single_operations_not_transaction_or_log_envelopes() -> TestResult {
    let codec = OperationJsonCodec::new(EditorContext::default());
    let mut value = serde_json::from_str::<Value>(TEXT_SPLICE_JSON)?;
    let operation = value
        .get("operation")
        .cloned()
        .ok_or_else(|| test_error("golden operation fixture has no operation"))?;
    value
        .as_object_mut()
        .ok_or_else(|| test_error("golden operation fixture is not an object"))?
        .insert("operations".to_owned(), Value::Array(vec![operation]));
    assert_rejected_code(&codec, &serde_json::to_string(&value)?, CodecErrorCode::InvalidJson)?;

    let transaction_shaped = json!({
        "format": "breditor/operation",
        "formatVersion": 1,
        "schema": { "name": "breditor/base", "version": 1 },
        "operations": [],
    });
    assert_rejected_code(
        &codec,
        &serde_json::to_string(&transaction_shaped)?,
        CodecErrorCode::InvalidJson,
    )?;

    let zero_transaction_budget = EditorContext::default().with_max_operations_per_transaction(0);
    let singular_codec = OperationJsonCodec::new(zero_transaction_budget);
    let operation = singular_codec.decode(TEXT_SPLICE_JSON)?;
    assert_eq!(singular_codec.encode(&operation)?, TEXT_SPLICE_JSON);
    Ok(())
}
