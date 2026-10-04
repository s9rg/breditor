//! Selection-driven wrapping and marker conversion for the sealed flat-list profile.
use super::{flat_list_support as support, support::disabled};
use crate::{
    action::{Action, ActionActivation, ActionEvaluation, ActionFault, ActionStateSpec},
    block::ListKind,
    state::EditorState,
};

/// Wraps touched bare blocks or converts selected items to one marker family.
///
/// The configured ordered start applies to newly created numbered sections.
/// Already-numbered sections retain their explicit starts; this is not a restart
/// command. Matching containers are preserved whole. Different source containers
/// remain distinct, while consecutive selected bare blocks form one new list.
/// Partial selections retain unselected prefixes/suffixes with original ordinals.
/// An end at the start of a later text block excludes that block. Each invocation
/// is one atomic history unit with exact selection and pending-format preservation.
/// Experimental only; hosts must register this action explicitly.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WrapListAction {
    target: ListKind,
}
impl WrapListAction {
    /// Configures the marker family and start for newly created numbered sections.
    #[must_use]
    pub const fn new(target: ListKind) -> Self {
        Self { target }
    }
    /// Returns the immutable list target.
    #[must_use]
    pub const fn target(&self) -> ListKind {
        self.target
    }
}
impl Action for WrapListAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        support::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        let source = match support::capture(state)? {
            Ok(source) => source,
            Err(decision) => return Ok(support::evaluation(decision, ActionActivation::Inactive)),
        };
        let activation = support::activation(&source, |kind| {
            kind.is_some_and(|kind| support::same_marker(kind, self.target))
        });
        if activation == ActionActivation::Active {
            return Ok(support::evaluation(disabled("breditor/list-unchanged"), activation));
        }
        let mut output = Vec::new();
        let mut bare = Vec::new();
        for section in &source.sections {
            if section.kind.is_none() {
                bare.extend(section.blocks.iter().cloned());
                continue;
            }
            if !bare.is_empty() {
                output.push(support::list(self.target, std::mem::take(&mut bare))?);
            }
            if section.kind.is_some_and(|kind| support::same_marker(kind, self.target)) {
                output.push(section.original.clone());
                continue;
            }
            support::retain(section, 0..section.selected.start, &mut output)?;
            output.push(support::list(
                self.target,
                section.blocks[section.selected.clone()].to_vec(),
            )?);
            support::retain(section, section.selected.end..section.blocks.len(), &mut output)?;
        }
        if !bare.is_empty() {
            output.push(support::list(self.target, bare)?);
        }
        Ok(support::evaluation(support::plan(state, &source, output)?, activation))
    }
}
