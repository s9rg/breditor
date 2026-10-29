//! Pure budget checks never establish any native proof or archive order.
use super::{MAX_DELIVERY_PATH_ANCESTORS, MAX_DELIVERY_PATH_ARCHIVE_BYTES};
use crate::{Error, Result};
pub(super) fn check(count: usize, bytes: u64) -> Result<()> {
    if count == 0 || count > MAX_DELIVERY_PATH_ANCESTORS || bytes > MAX_DELIVERY_PATH_ARCHIVE_BYTES
    {
        return Err(Error::Contract("delivery path count or byte budget"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_boundaries_refuse_without_allocating_or_trimming_history() {
        assert!(check(1, 0).is_ok());
        assert!(check(MAX_DELIVERY_PATH_ANCESTORS, MAX_DELIVERY_PATH_ARCHIVE_BYTES).is_ok());
        assert!(check(0, 0).is_err());
        assert!(check(MAX_DELIVERY_PATH_ANCESTORS + 1, 0).is_err());
        assert!(check(1, MAX_DELIVERY_PATH_ARCHIVE_BYTES + 1).is_err());
    }
}
