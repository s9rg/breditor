//! Immutable editor selections validated against one document snapshot.

mod error;
mod kind;
mod range_selection;

pub use error::{RangeEndpoint, SelectionEndpointRule, SelectionError};
pub use kind::{ResolvedSelection, Selection};
pub use range_selection::{RangeOrder, RangeSelection, ResolvedRangeSelection};
