use super::OrderedListStart;

/// The semantic marker policy for a future list container.
///
/// A list is not a paragraph decorated with a bullet. Its items and nesting
/// must be proved by the future structural grammar and transaction planner.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[non_exhaustive]
pub enum ListKind {
    /// An unordered list; marker appearance belongs to the renderer.
    Bullet,
    /// An ascending list with an explicit, checked first ordinal.
    Ordered(OrderedListStart),
}
