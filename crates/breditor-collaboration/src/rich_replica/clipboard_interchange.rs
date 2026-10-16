//! Pure external-interchange construction, independent of writer/selection/history families.
use super::RichReplica;
use crate::Error;
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichClipboardKind};

impl RichReplica {
    /// Admit an adapter's source root under this owner's immutable receiving schema.
    /// Source IDs are not reserved and assets are not fetched. Insertion remains a
    /// separate guarded paste with fresh identities and one writer-local history group.
    ///
    /// # Errors
    /// Rejects invalid kind/root, schema features, semantic geometry or resource limits.
    pub fn admit_clipboard_root(
        &self,
        kind: RichClipboardKind,
        root_json: &str,
    ) -> Result<String, Error> {
        let codec = RichClipboardJsonCodec::new(super::paragraphs::context(&self.codec));
        let fragment = codec
            .admit_root(kind, root_json)
            .map_err(|_| Error::Contract("shared clipboard interchange admission"))?;
        codec
            .encode_transfer(&fragment)
            .map_err(|_| Error::Contract("shared clipboard interchange encoding"))
    }
    /// Validate and canonicalize clipboard content for an external export adapter.
    /// No content, local UI, observation, journal, permissions or peer clocks change.
    ///
    /// # Errors
    /// Rejects wrong schema/fingerprint, unknown fields, history or resource limits.
    pub fn validate_clipboard(&self, input: &str) -> Result<String, Error> {
        let codec = RichClipboardJsonCodec::new(super::paragraphs::context(&self.codec));
        let fragment = codec
            .decode(input)
            .map_err(|_| Error::Contract("shared clipboard interchange validation"))?;
        codec
            .encode_transfer(&fragment)
            .map_err(|_| Error::Contract("shared clipboard interchange encoding"))
    }
}
