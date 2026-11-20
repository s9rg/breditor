//! Native shortcut lowering into original guarded causal commands; history never re-runs recognition.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation, actions,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{
    RichDocument, RichFlowParent, RichInputRuleKind, RichInputRulePlan, RichInputRuleStep,
    RichListKind, plan_rich_markdown_input_rule,
};
use serde_json::json;

impl RichReplica {
    /// Apply one explicitly selected native shortcut after retaining ordinary plain input.
    ///
    /// It is one isolated selective Undo group and existing semantic journal
    /// entries, not a new command, query replay or automatic recovery upgrade.
    /// A nonmatch keeps Redo, current observations and typing continuation exact.
    /// # Errors
    /// Stale/read-only sources, historically reused IDs, bounds or a causal/core
    /// preview disagreement leave every source/history/publication field unchanged.
    pub fn apply_markdown_input_rule_guarded(
        &mut self,
        observed: &SharedObservation,
        trigger: &str,
        namespace: &str,
    ) -> Result<bool, Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Ok(false);
        }
        let Some(selection) = self.selection()? else {
            return Ok(false);
        };
        let proof = selection.admit(&self.document)?;
        let context = super::paragraphs::context(&self.codec);
        let Some(plan) = plan_rich_markdown_input_rule(
            &context,
            &self.document,
            Some(&proof),
            trigger,
            namespace,
        )
        .map_err(|_| Error::Contract("input rule native admission"))?
        else {
            return Ok(false);
        };
        let commands = commands(&self.document, &plan)?;
        let pending = if matches!(plan.kind(), RichInputRuleKind::Code(_)) {
            vec![]
        } else {
            self.effective_formats(&selection)?
        };
        let caret = TextPoint {
            block: plan.caret().block().as_str().into(),
            offset: u32::try_from(plan.caret().offset().get()).map_err(|_| Error::Offset)?,
            affinity: Affinity::After,
        };
        self.apply_with_state_inner(
            commands,
            SelectionUpdate::Set(Some(Selection::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            PendingFormatsUpdate::Set(Some(pending)),
            None,
            Some(plan.document()),
        )
    }
}
fn commands(document: &RichDocument, plan: &RichInputRulePlan) -> Result<Vec<Command>, Error> {
    let block = plan.block().as_str();
    plan.steps()
        .iter()
        .map(|step| {
            Ok(match step {
                RichInputRuleStep::Delete { start, end } => {
                    Command::DeleteText(actions::DeleteText {
                        block: block.into(),
                        offset: u32::try_from(start.get()).map_err(|_| Error::Offset)?,
                        length: u32::try_from(end.get() - start.get())
                            .map_err(|_| Error::Offset)?,
                    })
                }
                RichInputRuleStep::Heading(level) => Command::SetHeading(actions::SetHeading {
                    block: block.into(),
                    level: Some(*level),
                }),
                RichInputRuleStep::List { container, item, kind } => {
                    Command::WrapList(actions::WrapList {
                        first: block.into(),
                        last: block.into(),
                        container: container.as_str().into(),
                        items: vec![item.as_str().into()],
                        style: match kind {
                            RichListKind::Bullet => actions::ListStyle::Bullet,
                            RichListKind::Ordered(start) => {
                                actions::ListStyle::Ordered { start: start.get() }
                            }
                        },
                    })
                }
                RichInputRuleStep::Blockquote(wrapper) => {
                    Command::WrapBlockquote(actions::WrapBlockquote {
                        first: block.into(),
                        last: block.into(),
                        wrapper: wrapper.as_str().into(),
                    })
                }
                RichInputRuleStep::Task { container, item, checked } => {
                    Command::WrapTaskList(actions::WrapTaskList {
                        first: block.into(),
                        last: block.into(),
                        container: container.as_str().into(),
                        items: vec![actions::NewTaskItem {
                            block: item.as_str().into(),
                            checked: *checked,
                        }],
                    })
                }
                RichInputRuleStep::Code(language) => Command::SetCodeBlock(actions::SetCodeBlock {
                    block: block.into(),
                    language: language.as_ref().map(|l| l.as_str().into()),
                    format_policy: actions::CodeFormatPolicy::RejectFormatted,
                }),
                RichInputRuleStep::HorizontalRule { block, position } => {
                    Command::InsertHorizontalRule(actions::InsertHorizontalRule {
                        block: block.as_str().into(),
                        parent: parent(document, position.parent())?,
                        before: position.before().map(|b| b.as_str().into()),
                    })
                }
                RichInputRuleStep::Inline { start, end, format } => {
                    Command::SetFormat(actions::SetFormat {
                        block: block.into(),
                        offset: u32::try_from(start.get()).map_err(|_| Error::Offset)?,
                        length: u32::try_from(end.get() - start.get())
                            .map_err(|_| Error::Offset)?,
                        format: json!({"type":format.kind().as_str(),"properties":{}}),
                        enabled: true,
                    })
                }
            })
        })
        .collect()
}
fn parent(document: &RichDocument, parent: &RichFlowParent) -> Result<Option<String>, Error> {
    Ok(match parent {
        RichFlowParent::Document => None,
        RichFlowParent::ListItem(id)
        | RichFlowParent::TaskItem(id)
        | RichFlowParent::Blockquote(id)
        | RichFlowParent::Details(id) => Some(id.as_str().into()),
        RichFlowParent::Cell(id) => {
            let node = document
                .cell_path(id)
                .and_then(|p| document.document().node_at(p).ok())
                .and_then(breditor_core::document::NodeRef::as_element)
                .ok_or(Error::Contract("input rule cell parent"))?;
            let key = breditor_core::identity::QualifiedName::try_new("breditor/block-id")
                .map_err(|_| Error::Contract("input rule parent identity"))?;
            Some(
                node.properties()
                    .get(&key)
                    .and_then(breditor_core::document::PropertyValue::as_string)
                    .ok_or(Error::Contract("input rule parent identity"))?
                    .into(),
            )
        }
    })
}
