/// Selection-sensitive activation exposed by one action evaluation.
///
/// `Mixed` is a first-class state for heterogeneous selections. `Stateless`
/// means the action does not advertise activation at all; it is not another
/// spelling of `Inactive`.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum ActionActivation {
    /// The action has no activation contract.
    Stateless,
    /// The action is observably inactive for the complete evaluated state.
    Inactive,
    /// The action is observably active for the complete evaluated state.
    Active,
    /// The evaluated state contains both active and inactive content.
    Mixed,
}
