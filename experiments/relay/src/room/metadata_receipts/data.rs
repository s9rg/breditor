//! Detached data with original descriptor/sequence/receipt semantics unchanged.
use super::packet::PacketFingerprint;
use crate::{DocumentSuggestionsPage, DocumentVersionCatalogPage, SuggestionRevisionsPage};
use serde::Serialize;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum LanePage<P> {
    Disabled {},
    Page { catalog: P, packets: Vec<PacketFingerprint> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetadataPage {
    pub versions: LanePage<DocumentVersionCatalogPage>,
    pub suggestions: LanePage<DocumentSuggestionsPage>,
    pub revisions: LanePage<SuggestionRevisionsPage>,
}
