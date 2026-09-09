//! Property-preserving operation payload records.

use serde::{Deserialize, Serialize};

use crate::record::{PropertyMapRecord, RootTextRangeRecordV1, TextRangeRecordV1};

/// The second primitive-operation payload generation.
///
/// This tagged union deliberately retains the four existing operation kinds;
/// only the fragment record generation changes so semantic format properties
/// survive persistence.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum OperationRecordV2 {
    TextSplice {
        range: TextRangeRecordV1,
        #[serde(rename = "expectedRemoved")]
        expected_removed: TextFragmentRecordV2,
        replacement: TextFragmentRecordV2,
    },
    ParagraphSplit {
        #[serde(rename = "paragraphPath")]
        paragraph_path: Vec<u32>,
        offset: u64,
        expected: TextFragmentRecordV2,
    },
    ParagraphJoin {
        #[serde(rename = "leftPath")]
        left_path: Vec<u32>,
        #[serde(rename = "expectedLeft")]
        expected_left: TextFragmentRecordV2,
        #[serde(rename = "expectedRight")]
        expected_right: TextFragmentRecordV2,
    },
    RootTextReplace {
        range: RootTextRangeRecordV1,
        #[serde(rename = "expectedParagraphs")]
        expected_paragraphs: Vec<TextFragmentRecordV2>,
        #[serde(rename = "replacementParagraphs")]
        replacement_paragraphs: Vec<TextFragmentRecordV2>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TextFragmentRecordV2 {
    pub(crate) runs: Vec<TextRunRecordV2>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TextRunRecordV2 {
    pub(crate) text: String,
    pub(crate) formats: Vec<OperationFormatRecordV2>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OperationFormatRecordV2 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: PropertyMapRecord,
}
