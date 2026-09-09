/// Whether a declared inline-format property must be present.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum PropertyPresenceV1 {
    /// Every instance of the format must contain the property.
    Required,
    /// The property may be absent; a present `null` is still a value and is rejected.
    Optional,
}
