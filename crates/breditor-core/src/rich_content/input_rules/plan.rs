//! Capture dependent ordinary actions against private admitted snapshots; replay never reruns a rule.
use super::{
    RichInputRuleError, RichInputRuleKind, RichInputRuleStep, block_rule, inline_rule,
    source::Source,
};
use crate::{
    document::{Format, PropertyMap},
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichFlowParent, RichFlowPosition, RichSelection, RichSelectionKind,
        RichTextPoint,
        actions::{self, RichAction},
    },
    state::EditorContext,
};

/// Opaque exact-source shortcut proof. Only checked native recognition constructs one.
#[derive(Clone, Debug)]
pub struct RichInputRulePlan {
    source: RichDocument,
    kind: RichInputRuleKind,
    block: BlockId,
    steps: Vec<RichInputRuleStep>,
    actions: Vec<RichAction>,
    document: RichDocument,
    caret: RichTextPoint,
}
impl RichInputRulePlan {
    /// Recognized transformation, not an authorization or a serialized command.
    #[must_use]
    pub const fn kind(&self) -> &RichInputRuleKind {
        &self.kind
    }
    /// Stable retained text identity.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Dependent semantic lowering for a native causal adapter.
    #[must_use]
    pub fn steps(&self) -> &[RichInputRuleStep] {
        &self.steps
    }
    /// Already captured local actions, in execution order.
    #[must_use]
    pub fn actions(&self) -> &[RichAction] {
        &self.actions
    }
    /// Scalar-safe caret after the complete transformation.
    #[must_use]
    pub const fn caret(&self) -> &RichTextPoint {
        &self.caret
    }
    /// Fully admitted immutable preview; never a shared root mutation.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Validate complete source identity/tree before using this proof.
    /// # Errors
    /// Rejects any changed source or durable binding.
    pub fn validate_for(&self, document: &RichDocument) -> Result<(), RichInputRuleError> {
        if document.document() != self.source.document() {
            return Err(RichInputRuleError::StaleSource);
        }
        Ok(())
    }
    fn push(
        &mut self,
        context: &EditorContext,
        step: RichInputRuleStep,
    ) -> Result<(), RichInputRuleError> {
        let action = capture(&self.document, &self.block, &step)?;
        if let Some(edit) = action.apply(context, &self.document)? {
            self.document = edit.into_parts().0;
        }
        self.steps.push(step);
        self.actions.push(action);
        Ok(())
    }
}
fn fresh(
    document: &RichDocument,
    namespace: &str,
    suffix: &str,
) -> Result<BlockId, RichInputRuleError> {
    if namespace.len() > 90 || BlockId::try_new(namespace).is_err() {
        return Err(RichInputRuleError::Identity);
    }
    let id = BlockId::try_new(format!("{namespace}:rule:{suffix}"))
        .map_err(|_| RichInputRuleError::Identity)?;
    if document.block_path(&id).is_some() {
        return Err(RichInputRuleError::Identity);
    }
    Ok(id)
}
fn structural_step(
    document: &RichDocument,
    namespace: &str,
    kind: &RichInputRuleKind,
    position: RichFlowPosition,
) -> Result<RichInputRuleStep, RichInputRuleError> {
    Ok(match kind {
        RichInputRuleKind::Heading(level) => RichInputRuleStep::Heading(*level),
        RichInputRuleKind::List(style) => RichInputRuleStep::List {
            container: fresh(document, namespace, "list")?,
            item: fresh(document, namespace, "item")?,
            kind: *style,
        },
        RichInputRuleKind::Blockquote => {
            RichInputRuleStep::Blockquote(fresh(document, namespace, "quote")?)
        }
        RichInputRuleKind::Task(checked) => RichInputRuleStep::Task {
            container: fresh(document, namespace, "tasks")?,
            item: fresh(document, namespace, "task")?,
            checked: *checked,
        },
        RichInputRuleKind::Code(language) => RichInputRuleStep::Code(language.clone()),
        RichInputRuleKind::HorizontalRule => {
            RichInputRuleStep::HorizontalRule { block: fresh(document, namespace, "hr")?, position }
        }
        RichInputRuleKind::Inline(_) => unreachable!("block recognizer cannot return inline rules"),
    })
}
/// Plan one explicit local plain-input trigger against its exact post-input caret.
///
/// Only ASCII space or one closing marker scalar can trigger. Empty/nonmatching
/// input, selections, code blocks and unsupported grammar/parent positions are
/// inactive. The host retains the literal input first; applying this separate
/// group makes one Undo restore the complete marker including its trigger.
/// # Errors
/// Invalid/stale selections, exhausted bounds, reused IDs or receiving admission fail closed.
pub fn plan_rich_markdown_input_rule(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    trigger: &str,
    namespace: &str,
) -> Result<Option<RichInputRulePlan>, RichInputRuleError> {
    if !super::is_rich_markdown_input_rule_trigger(trigger) {
        return Ok(None);
    }
    let Some(selection) = selection else {
        return Ok(None);
    };
    selection.resolve(document).map_err(|_| RichInputRuleError::Selection)?;
    let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
        return Ok(None);
    };
    if anchor.block() != focus.block() || anchor.offset() != focus.offset() {
        return Ok(None);
    }
    let source = Source::read(document, focus)?;
    if source.node.kind().as_str() == "breditor/code-block" || !source.prefix.ends_with(trigger) {
        return Ok(None);
    }
    // A section summary stays a summary: block-level shortcuts never convert it.
    let summary = crate::rich_content::details::is_summary_kind(source.node.kind().as_str());
    let block_kind = if trigger == " " && !summary { block_rule::recognize(&source) } else { None };
    let (kind, steps, caret) = if let Some(kind) = block_kind {
        let Some(position) = document.flow_position_before(focus.block()) else {
            return Ok(None);
        };
        let prose_head =
            matches!(position.parent(), RichFlowParent::ListItem(_) | RichFlowParent::TaskItem(_))
                && document.block_path(focus.block()).is_some_and(|p| p.last_index() == Some(0));
        if prose_head && !matches!(kind, RichInputRuleKind::Heading(_)) {
            return Ok(None);
        }
        if context.schema().rich_content_revision().is_none_or(|v| v < 2)
            && !matches!(kind, RichInputRuleKind::Heading(_) | RichInputRuleKind::List(_))
        {
            return Ok(None);
        }
        let step = structural_step(document, namespace, &kind, position)?;
        (
            kind,
            vec![RichInputRuleStep::Delete { start: TextOffset::ZERO, end: focus.offset() }, step],
            TextOffset::ZERO,
        )
    } else {
        let Some(found) = inline_rule::recognize(&source, trigger)? else {
            return Ok(None);
        };
        if !context.schema().is_property_free_inline_format(&found.format.kind()) {
            return Ok(None);
        }
        let width = found.content.get() - found.start.get();
        let body = found.closing.get() - found.content.get();
        let end = TextOffset::try_new(found.start.get() + body)
            .map_err(|_| RichInputRuleError::Selection)?;
        let caret = TextOffset::try_new(focus.offset().get() - width * 2)
            .map_err(|_| RichInputRuleError::Selection)?;
        (
            RichInputRuleKind::Inline(found.format),
            vec![
                RichInputRuleStep::Delete { start: found.closing, end: focus.offset() },
                RichInputRuleStep::Delete { start: found.start, end: found.content },
                RichInputRuleStep::Inline { start: found.start, end, format: found.format },
            ],
            caret,
        )
    };
    let mut plan = RichInputRulePlan {
        source: document.clone(),
        kind,
        block: focus.block().clone(),
        steps: vec![],
        actions: vec![],
        document: document.clone(),
        caret: RichTextPoint::new(focus.block().clone(), caret, Affinity::After),
    };
    for step in steps {
        plan.push(context, step)?;
    }
    // Recheck the complete group ceiling and actual resulting caret, not only individual steps.
    actions::apply_batch(context, document, &plan.actions)?;
    RichSelection::try_new(
        &plan.document,
        RichSelectionKind::TextRange { anchor: plan.caret.clone(), focus: plan.caret.clone() },
    )
    .map_err(|_| RichInputRuleError::Selection)?;
    Ok(Some(plan))
}
fn capture(
    document: &RichDocument,
    block: &BlockId,
    step: &RichInputRuleStep,
) -> Result<RichAction, actions::RichActionError> {
    use actions::{
        CodeFormatPolicy, DeleteText, InsertHorizontalRule, RichFormatChange, SetCodeBlock,
        SetHeading, SetInlineFormat, WrapBlockquote, WrapList, WrapTaskList,
    };
    Ok(match step {
        RichInputRuleStep::Delete { start, end } => {
            RichAction::DeleteText(DeleteText::capture(document, block, *start, *end)?)
        }
        RichInputRuleStep::Heading(level) => {
            RichAction::SetHeading(SetHeading::capture(document, block, Some(*level))?)
        }
        RichInputRuleStep::List { container, item, kind } => {
            RichAction::WrapList(WrapList::capture(
                document,
                block,
                block,
                container,
                std::slice::from_ref(item),
                *kind,
            )?)
        }
        RichInputRuleStep::Blockquote(wrapper) => {
            RichAction::WrapBlockquote(WrapBlockquote::capture(document, block, block, wrapper)?)
        }
        RichInputRuleStep::Task { container, item, checked } => RichAction::WrapTaskList(
            WrapTaskList::capture(document, block, block, container, &[(item.clone(), *checked)])?,
        ),
        RichInputRuleStep::Code(language) => RichAction::SetCodeBlock(SetCodeBlock::capture(
            document,
            block,
            language.as_ref(),
            CodeFormatPolicy::RejectFormatted,
        )?),
        RichInputRuleStep::HorizontalRule { block, position } => RichAction::InsertHorizontalRule(
            InsertHorizontalRule::capture(document, position, block)?,
        ),
        RichInputRuleStep::Inline { start, end, format } => {
            RichAction::SetInlineFormat(SetInlineFormat::capture(
                document,
                block,
                *start,
                *end,
                &RichFormatChange::Set(Format::new(format.kind(), PropertyMap::default())),
            )?)
        }
    })
}
