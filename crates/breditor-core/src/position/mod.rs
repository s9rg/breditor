//! Snapshot-local structural paths and points.

mod affinity;
mod node_path;
mod point;
mod point_order;
mod text_offset;

pub use affinity::Affinity;
pub use node_path::{MAX_PATH_DEPTH, NodePath, NodePathError};
pub use point::{Point, PointError, ResolvedPoint};
pub use point_order::{PointComparisonError, PointOperand, compare_points};
pub use text_offset::{MAX_TEXT_OFFSET, TextOffset, TextOffsetError};
