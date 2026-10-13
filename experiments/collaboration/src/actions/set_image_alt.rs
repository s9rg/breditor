//! Alt text is independent of binary replacement and upload progress.

use super::validate_id;
use crate::{
    Error,
    register::{self, Stamp},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Set plain semantic alt text in the feasibility model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetImageAlt {
    /// Stable image node identity.
    pub image: String,
    /// Empty alt text is admitted; decorative-image policy belongs to rich schema.
    pub alt: String,
}

impl SetImageAlt {
    pub(crate) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        validate_id(&self.image)?;
        if self.alt.len() > 4096 {
            return Err(Error::Limit("alt text bytes"));
        }
        register::write(
            &doc.get_map("images").ensure_mergeable_map(&self.image)?,
            "alt",
            stamp,
            self.alt.as_str().into(),
        )?;
        Ok(())
    }
}
