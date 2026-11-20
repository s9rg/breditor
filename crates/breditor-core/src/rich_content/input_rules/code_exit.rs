//! Conventional code Enter: a third Enter on two empty trailing lines leaves the code block.
use super::{
    RichInputRuleError, RichInputRuleKind, RichInputRulePlan, RichInputRuleStep, plan::fresh,
    source::Source,
};
use crate::{
    position::{Affinity, TextOffset},
    rich_content::{RichDocument, RichSelection, RichSelectionKind, RichTextPoint},
    state::EditorContext,
};

/// Three trailing line feeds ending at the caret, i.e. two empty lines plus the retained Enter.
const EXIT: &str = "\n\n\n";

/// Plan the code exit after a retained `"\n"` at the end of a code block.
///
/// The caret must be collapsed at the very end of a code block whose text ends with
/// three line feeds. The three line feeds are removed and a fresh empty paragraph is
/// entered directly after the code block, in the same flow. Elsewhere `"\n"` stays literal.
/// # Errors
/// Invalid/stale selections, reused identities or receiving admission fail closed.
pub(super) fn plan(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    namespace: &str,
) -> Result<Option<RichInputRulePlan>, RichInputRuleError> {
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
    if source.node.kind().as_str() != "breditor/code-block"
        || source.caret != source.length
        || !source.prefix.ends_with(EXIT)
    {
        return Ok(None);
    }
    let Some(position) = document.flow_position_after(focus.block()) else {
        return Ok(None);
    };
    let paragraph = fresh(document, namespace, "p")?;
    let start = TextOffset::try_new(source.caret - 3).map_err(|_| RichInputRuleError::Selection)?;
    RichInputRulePlan::build(
        context,
        document,
        RichInputRuleKind::CodeExit,
        focus.block().clone(),
        vec![
            RichInputRuleStep::Delete { start, end: focus.offset() },
            RichInputRuleStep::Paragraph { block: paragraph.clone(), position },
        ],
        RichTextPoint::new(paragraph, TextOffset::ZERO, Affinity::After),
    )
    .map(Some)
}
