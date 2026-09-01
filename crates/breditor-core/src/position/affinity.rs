/// Which side of inserted content owns a point at an exact boundary.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Affinity {
    /// Keep the point before content inserted at the same boundary.
    Before,
    /// Keep the point after content inserted at the same boundary.
    After,
}
