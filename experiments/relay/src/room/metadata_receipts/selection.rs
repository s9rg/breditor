//! Every enabled lane is explicit; omission cannot manufacture completeness.
use crate::{
    DocumentSuggestionsCursor, DocumentVersionsCursor, Error, Result, SuggestionRevisionsCursor,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum LaneSelection<C> {
    Disabled {},
    Start {},
    After { cursor: C },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MetadataPageSelection {
    pub versions: LaneSelection<DocumentVersionsCursor>,
    pub suggestions: LaneSelection<DocumentSuggestionsCursor>,
    pub revisions: LaneSelection<SuggestionRevisionsCursor>,
}

fn cursor(binding: &str, after: &str, through: &str) -> Result<()> {
    let decimal = |value: &str| value.parse::<u64>().is_ok_and(|n| n.to_string() == value);
    if binding.len() != 64
        || !binding.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        || !decimal(after)
        || !decimal(through)
    {
        return Err(Error::Contract("metadata page cursor spelling"));
    }
    Ok(())
}

impl MetadataPageSelection {
    pub fn validate(&self) -> Result<()> {
        if let LaneSelection::After { cursor: value } = &self.versions {
            cursor(&value.binding, &value.after, &value.through)?;
        }
        if let LaneSelection::After { cursor: value } = &self.suggestions {
            cursor(&value.binding, &value.after, &value.through)?;
        }
        if let LaneSelection::After { cursor: value } = &self.revisions {
            cursor(&value.binding, &value.after, &value.through)?;
        }
        Ok(())
    }
}
