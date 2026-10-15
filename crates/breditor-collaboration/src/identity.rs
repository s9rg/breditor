//! Shared identity admission is independent of the legacy probe command set.
use crate::Error;

pub(crate) fn validate_id(id: &str) -> Result<(), Error> {
    breditor_core::rich_content::BlockId::try_new(id)
        .map(|_| ())
        .map_err(|_| Error::Contract("identity"))
}
