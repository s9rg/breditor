//! Asset identity is immutable host content identity, never a DOM URL.

use super::validate_id;
use crate::{
    Error,
    register::{self, Stamp},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Set an immutable reference independently of image node identity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetImageAsset {
    /// Stable image node identity.
    pub image: String,
    /// Host asset identity, not credentials, signed URLs or binary data.
    pub asset: String,
}

impl SetImageAsset {
    pub(crate) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        validate_id(&self.image)?;
        validate_id(&self.asset)?;
        register::write(
            &doc.get_map("images").ensure_mergeable_map(&self.image)?,
            "asset",
            stamp,
            self.asset.as_str().into(),
        )?;
        Ok(())
    }
}
