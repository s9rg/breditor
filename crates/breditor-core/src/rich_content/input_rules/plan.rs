//! Capture dependent ordinary actions against private admitted snapshots; replay never reruns a rule.
use super::{
    RichInputRuleError, RichInputRuleKind, RichInputRuleStep, block_rule, code_exit, inline_rule,
    list_rule, source::Source,
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
    /// Capture every dependent step against its admitted predecessor, then recheck the group.
    pub(super) fn build(
        context: &EditorContext,
        document: &RichDocument,
        kind: RichInputRuleKind,
        block: BlockId,
        steps: Vec<RichInputRuleStep>,
        caret: RichTextPoint,
    ) -> Result<Self, RichInputRuleError> {
        let mut plan = Self {
            source: document.clone(),
            kind,
            block,
            steps: vec![],
            actions: vec![],
            document: document.clone(),
            caret,
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
        Ok(plan)
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
pub(super) fn fresh(
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
        RichInputRuleKind::Inline(_)
        | RichInputRuleKind::Link
        | RichInputRuleKind::ListJoin(_)
        | RichInputRuleKind::TaskJoin(_)
        | RichInputRuleKind::ListItemTask(_)
        | RichInputRuleKind::CodeExit
        | RichInputRuleKind::Typography(_) => {
            unreachable!("block recognizer returns only base structural rules")
        }
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
    if trigger == "\n" {
        return code_exit::plan(context, document, selection, namespace);
    }
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
        let item_head = matches!(position.parent(), RichFlowParent::ListItem(_));
        let prose_head = (item_head || matches!(position.parent(), RichFlowParent::TaskItem(_)))
            && document.block_path(focus.block()).is_some_and(|p| p.last_index() == Some(0));
        // A required item head keeps its prose shape; only a bullet item's task marker converts.
        if prose_head
            && !matches!(kind, RichInputRuleKind::Heading(_))
            && !(item_head && matches!(kind, RichInputRuleKind::Task(_)))
        {
            return Ok(None);
        }
        if context.schema().rich_content_revision().is_none_or(|v| v < 2)
            && !matches!(kind, RichInputRuleKind::Heading(_) | RichInputRuleKind::List(_))
        {
            return Ok(None);
        }
        let (kind, structural) = match (prose_head, kind) {
            (true, RichInputRuleKind::Task(checked)) => {
                match list_rule::item_task(document, namespace, focus.block(), checked)? {
                    Some(found) => found,
                    None => return Ok(None),
                }
            }
            (_, kind) => {
                let step = structural_step(document, namespace, &kind, position)?;
                list_rule::join(document, focus.block(), kind, step)
            }
        };
        let mut steps =
            vec![RichInputRuleStep::Delete { start: TextOffset::ZERO, end: focus.offset() }];
        steps.extend(structural);
        (kind, steps, TextOffset::ZERO)
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
    RichInputRulePlan::build(
        context,
        document,
        kind,
        focus.block().clone(),
        steps,
        RichTextPoint::new(focus.block().clone(), caret, Affinity::After),
    )
    .map(Some)
}
/// Plan one plain-input trigger under an explicitly selected rule set.
///
/// Markdown recognition (when selected) runs first; a space that matched no
/// Markdown shortcut may then autolink the URL candidate before it. The empty
/// set never matches. The host retains the literal input first, exactly as for
/// [`plan_rich_markdown_input_rule`].
/// # Errors
/// Invalid/stale selections, exhausted bounds, reused IDs or receiving admission fail closed.
pub fn plan_rich_input_rule(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    trigger: &str,
    namespace: &str,
    rules: super::RichInputRuleSet,
) -> Result<Option<RichInputRulePlan>, RichInputRuleError> {
    if rules.markdown()
        && let Some(plan) =
            plan_rich_markdown_input_rule(context, document, selection, trigger, namespace)?
    {
        return Ok(Some(plan));
    }
    if rules.autolink()
        && trigger == " "
        && let Some(plan) = super::autolink::plan(context, document, selection, None)?
    {
        return Ok(Some(plan));
    }
    if let Some(config) = rules.typography() {
        return super::typography::plan(context, document, selection, trigger, &config);
    }
    Ok(None)
}
/// Plan a typed autolink after an Enter split retained the candidate at its block end.
///
/// `end` is the original pre-split caret, now the end of the retained left
/// block. The selection is the post-split caret and is kept unchanged. Only
/// the optional `autolink-v1` policy uses this; it changes no text.
/// # Errors
/// Invalid/stale points, exhausted bounds or receiving admission fail closed.
pub fn plan_rich_paragraph_autolink_input_rule(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    end: &RichTextPoint,
) -> Result<Option<RichInputRulePlan>, RichInputRuleError> {
    super::autolink::plan(context, document, selection, Some(end))
}
fn capture(
    document: &RichDocument,
    block: &BlockId,
    step: &RichInputRuleStep,
) -> Result<RichAction, actions::RichActionError> {
    use crate::{document::TextFragment, rich_content::RichBlockDraft};
    use actions::{
        CodeFormatPolicy, DeleteText, InsertBlocks, InsertHorizontalRule, InsertText, MoveBlock,
        OutdentListItems, OutdentTaskItems, RichFormatChange, SetCodeBlock, SetHeading,
        SetInlineFormat, WrapBlockquote, WrapList, WrapTaskList,
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
        RichInputRuleStep::TaskRange { last, container, item, checked } => {
            RichAction::WrapTaskList(WrapTaskList::capture(
                document,
                block,
                last,
                container,
                &[(item.clone(), *checked)],
            )?)
        }
        RichInputRuleStep::MoveBlock { block, parent, before } => RichAction::MoveBlock(
            MoveBlock::capture(document, block, parent.as_ref(), before.as_ref())?,
        ),
        RichInputRuleStep::OutdentListItem { container, item, fresh_tail } => {
            RichAction::OutdentListItems(OutdentListItems::capture(
                document,
                container,
                item,
                item,
                fresh_tail.as_ref(),
            )?)
        }
        RichInputRuleStep::OutdentTaskItem { container, item } => RichAction::OutdentTaskItems(
            OutdentTaskItems::capture(document, container, item, item, None)?,
        ),
        RichInputRuleStep::Paragraph { block, position } => {
            RichAction::InsertBlocks(InsertBlocks::capture(
                document,
                position,
                vec![RichBlockDraft::paragraph(block, &TextFragment::empty())?],
            )?)
        }
        RichInputRuleStep::Link { start, end, href } => {
            RichAction::SetInlineFormat(SetInlineFormat::capture(
                document,
                block,
                *start,
                *end,
                &RichFormatChange::Set(link_format(href)?),
            )?)
        }
        RichInputRuleStep::Insert { at, text, formats } => {
            let fragment = TextFragment::try_from_runs(vec![
                crate::document::TextRun::try_new(text.clone(), formats.clone())
                    .map_err(|_| actions::RichActionError::FormatChanges)?,
            ])
            .map_err(|_| actions::RichActionError::FormatChanges)?;
            RichAction::InsertText(InsertText::capture(
                document,
                &crate::rich_content::RichTextPoint::new(block.clone(), *at, Affinity::After),
                &fragment,
            )?)
        }
    })
}
/// The standard link format with an admitted target and the same-window flag.
fn link_format(href: &str) -> Result<Format, actions::RichActionError> {
    use crate::rich_content::{
        STANDARD_INLINE_HREF_V1, STANDARD_INLINE_NEW_WINDOW_V1, StandardInlineFormatV1,
    };
    use crate::{document::PropertyValue, identity::QualifiedName};
    let properties = PropertyMap::try_from_sorted(vec![
        (
            QualifiedName::from_known_static(STANDARD_INLINE_HREF_V1),
            PropertyValue::from_string(href),
        ),
        (
            QualifiedName::from_known_static(STANDARD_INLINE_NEW_WINDOW_V1),
            PropertyValue::boolean(false),
        ),
    ])
    .map_err(|_| actions::RichActionError::FormatChanges)?;
    Ok(Format::new(StandardInlineFormatV1::Link.kind(), properties))
}
