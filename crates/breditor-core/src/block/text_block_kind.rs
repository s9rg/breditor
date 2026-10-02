use super::HeadingLevel;

/// A whole text block's semantic role, not an inline format.
///
/// This closed initial value contract has no node IDs, text payload or schema
/// proof. Further block families need their own explicit structural contracts.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[non_exhaustive]
pub enum TextBlockKind {
    /// An ordinary body paragraph.
    Paragraph,
    /// A semantic heading with a checked rank, independent of its presentation.
    Heading(HeadingLevel),
}
