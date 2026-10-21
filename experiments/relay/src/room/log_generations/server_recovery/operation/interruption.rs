//! Exercise real synced local publication boundaries, never fabricated native acknowledgements.
use crate::Result;
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Point {
    StageCreated,
    IntentSelected,
    #[cfg(test)]
    DataPrefix,
    DataSynced,
    MarkerLinked,
    StageRetired,
}
#[derive(Default)]
pub(super) struct Interruption {
    pub point: Option<Point>,
}
impl Interruption {
    pub fn after(&self, point: Point) -> Result<()> {
        if self.point == Some(point) {
            return Err(crate::Error::Contract("interrupted generation operational handoff"));
        }
        Ok(())
    }
}
