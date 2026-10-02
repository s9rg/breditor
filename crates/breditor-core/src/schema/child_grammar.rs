//! Bounded, deterministic child languages for the sealed schema compiler.
//!
//! A sequence consists of ordered groups, each repeating a disjoint set of
//! alternatives. No kind may occur in two groups: this deliberately excludes
//! ambiguous grammars and keeps validation linear without backtracking.

use crate::{document::NodeRef, identity::QualifiedName};

/// Compiler bounds, independent of document node/child/depth budgets.
pub(super) const MAX_CHILD_GROUPS: usize = 8;
pub(super) const MAX_CHILD_ALTERNATIVES: usize = 16;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ChildConstraint {
    pub(super) groups: Vec<ChildGroup>,
}

impl ChildConstraint {
    pub(super) fn repeated(kind: ChildKind, minimum: u32, maximum: Option<u32>) -> Self {
        Self { groups: vec![ChildGroup { kinds: vec![kind], minimum, maximum }] }
    }

    /// Retains the exact legacy fingerprint encoding for a single-kind repeat.
    pub(super) fn single(&self) -> Option<(&ChildKind, &ChildGroup)> {
        let [group] = self.groups.as_slice() else { return None };
        let [kind] = group.kinds.as_slice() else { return None };
        Some((kind, group))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ChildGroup {
    pub(super) kinds: Vec<ChildKind>,
    pub(super) minimum: u32,
    pub(super) maximum: Option<u32>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) enum ChildKind {
    Text,
    Element(QualifiedName),
}

impl ChildKind {
    fn matches(&self, node: &NodeRef) -> bool {
        match self {
            Self::Text => node.as_text().is_some(),
            Self::Element(kind) => node.as_element().is_some_and(|node| node.kind() == kind),
        }
    }
}

/// Constant-space recognizer over a compiler-checked, disjoint grammar.
///
/// Invalid input is never repaired. A false return must reject the document,
/// even if subsequent children make the remaining suffix well-formed.
pub(super) struct ChildSequence<'a> {
    constraint: &'a ChildConstraint,
    group: usize,
    count: u32,
}

impl<'a> ChildSequence<'a> {
    pub(super) const fn new(constraint: &'a ChildConstraint) -> Self {
        Self { constraint, group: 0, count: 0 }
    }

    pub(super) fn observe(&mut self, node: &NodeRef) -> bool {
        let Some(next) = self
            .constraint
            .groups
            .iter()
            .position(|group| group.kinds.iter().any(|kind| kind.matches(node)))
        else {
            return false;
        };
        if next < self.group {
            return false;
        }
        let mut valid = true;
        if next > self.group {
            valid = self.count >= self.constraint.groups[self.group].minimum
                && self.constraint.groups[self.group + 1..next]
                    .iter()
                    .all(|group| group.minimum == 0);
            self.group = next;
            self.count = 0;
        }
        let Some(count) = self.count.checked_add(1) else { return false };
        self.count = count;
        valid && self.constraint.groups[self.group].maximum.is_none_or(|max| count <= max)
    }

    pub(super) fn missing_required(&self) -> bool {
        self.count < self.constraint.groups[self.group].minimum
            || self.constraint.groups[self.group + 1..].iter().any(|group| group.minimum > 0)
    }
}
