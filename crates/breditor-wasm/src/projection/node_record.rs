use breditor_core::document::NodeRef;

pub(super) struct ProjectionNodeRecord {
    node: NodeRef,
    children: Box<[usize]>,
}

impl ProjectionNodeRecord {
    pub(super) fn new(node: NodeRef) -> Self {
        Self { node, children: Box::new([]) }
    }

    pub(super) const fn node(&self) -> &NodeRef {
        &self.node
    }

    pub(super) fn children(&self) -> &[usize] {
        &self.children
    }

    pub(super) fn set_children(&mut self, children: Vec<usize>) {
        self.children = children.into_boxed_slice();
    }
}
