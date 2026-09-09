use std::error::Error;

use crate::{
    document::{Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace,
        TextRange, TextSplice,
    },
    position::{NodePath, TextOffset},
};

use super::operation_payload_v2::{decode_operation_payload_v2, encode_operation_payload_v2};

type TestResult = Result<(), Box<dyn Error>>;

fn fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![(
        QualifiedName::try_new("example/enabled")?,
        PropertyValue::boolean(true),
    )])?;
    let formats = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("example/highlight")?,
        properties,
    )])?;
    TextFragment::try_from_runs(vec![TextRun::try_new(text, formats)?]).map_err(Into::into)
}

#[test]
fn every_primitive_fragment_role_preserves_properties() -> TestResult {
    let paragraph = NodePath::try_from_indices(vec![0])?;
    let zero = TextOffset::ZERO;
    let one = TextOffset::try_new(1)?;
    let expected = fragment("x")?;
    let replacement = fragment("y")?;
    let local_range = TextRange::try_new(paragraph.clone(), zero, one)?;
    let root_range = RootTextRange::try_new(
        RootTextBoundary::try_new(paragraph.clone(), zero)?,
        RootTextBoundary::try_new(paragraph.clone(), one)?,
    )?;
    let operations: Vec<Operation> = vec![
        TextSplice::try_new(local_range, expected.clone(), replacement.clone())?.into(),
        ParagraphSplit::try_new(paragraph.clone(), zero, expected.clone())?.into(),
        ParagraphJoin::try_new(paragraph, expected.clone(), replacement.clone())?.into(),
        RootTextReplace::try_new(root_range, vec![expected.clone()], vec![replacement.clone()])?
            .into(),
    ];

    for operation in operations {
        let record = encode_operation_payload_v2(&operation);
        assert_eq!(decode_operation_payload_v2(record)?, operation);
    }
    Ok(())
}
