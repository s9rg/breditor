//! Human-readable plain fallback; structured clipboard is the lossless rich channel.

use super::{RichClipboardError, RichClipboardFragment};
use crate::{document::NodeRef, rich_content::ast_properties};

impl RichClipboardFragment {
    /// Export text in reading order, with quoted TSV for tables and no list markers.
    ///
    /// Images contribute nondecorative alt text and caption, never a URL or asset credential.
    /// This fallback cannot restore formatting, images or table geometry by itself.
    ///
    /// # Errors
    /// Returns an error only if an admitted private tree contradicts its proof.
    pub fn plain_text(&self) -> Result<String, RichClipboardError> {
        text(self.document.document().root())
    }
}
fn text(node: &NodeRef) -> Result<String, RichClipboardError> {
    if let Some(node) = node.as_text() {
        return Ok(node.text().to_owned());
    }
    let node = node.as_element().ok_or(RichClipboardError::Invariant)?;
    let values = node.children().iter().map(text).collect::<Result<Vec<_>, _>>()?;
    match node.kind().as_str() {
        "breditor/paragraph" | "breditor/heading" => Ok(values.concat()),
        "breditor/table-row" => {
            Ok(values.iter().map(|value| tsv_field(value)).collect::<Vec<_>>().join("\t"))
        }
        "breditor/image" => {
            let alt = ast_properties::string(node, "alt-text")
                .map_err(|_| RichClipboardError::Invariant)?;
            let mut values = values;
            if !alt.is_empty() {
                values.insert(0, alt.to_owned());
            }
            Ok(values.join("\n"))
        }
        _ => Ok(values.join("\n")),
    }
}
fn tsv_field(value: &str) -> String {
    if value.contains(['\t', '\n', '\r', '"']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}
