//! Selected plain input uses the logical start's style and one explicit post-replacement caret.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
    actions::{RangeTextRun, ReplaceTextRange},
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};

impl RichReplica {
    pub(super) fn replace_plain_selection(
        &mut self,
        text: &str,
        selection: &Selection,
    ) -> Result<bool, Error> {
        let Selection::TextRange { anchor, focus } = selection else {
            return Err(Error::Contract("shared typing requires text selection"));
        };
        if text.len() > 64 * 1024 {
            return Err(Error::Limit("shared typing bytes"));
        }
        let (start, _) = super::range_plan::ordered(&self.document, anchor, focus)?;
        let start = start.clone();
        let style_selection = Selection::TextRange { anchor: start.clone(), focus: start.clone() };
        let formats = self.effective_formats(&style_selection)?;
        let next = TextPoint {
            block: start.block,
            offset: start
                .offset
                .checked_add(u32::try_from(text.encode_utf16().count()).map_err(|_| Error::Offset)?)
                .ok_or(Error::Offset)?,
            affinity: Affinity::After,
        };
        self.apply_with_state(
            vec![Command::ReplaceTextRange(ReplaceTextRange {
                anchor: anchor.clone(),
                focus: focus.clone(),
                runs: if text.is_empty() {
                    vec![]
                } else {
                    vec![RangeTextRun { text: text.into(), formats }]
                },
            })],
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(None),
        )
    }
}
