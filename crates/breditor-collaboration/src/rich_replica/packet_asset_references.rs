//! Independent, source-bound packet dependency reads; no author, server or GC authority.
use super::{RichReplica, WriterDependency, document_versions::VersionAssetReference};
use crate::Error;
use breditor_core::rich_content::{RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference};
use serde::Serialize;
use std::{
    collections::BTreeSet,
    io::{self, Write},
};

/// Complete encoded packet-read ceiling, independent of packet/document admission.
pub const SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES: usize = 8 * 1024 * 1024;
/// Native admitted immutable artifact identity, not creator authentication.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum PacketAssetIdentity {
    /// Only the admitted saved snapshot's native image bindings are read; source provenance is separate.
    Version {
        /// Exact immutable semantic snapshot hash.
        id: String,
    },
    /// An original proposal whose captured source is evaluated natively on a disposable fork.
    Suggestion {
        /// Exact immutable proposal hash.
        id: String,
    },
    /// Both predecessor and replacement dependencies; neither proposal is finalized or accepted.
    SuggestionRevision {
        /// Exact immutable revision relation hash.
        id: String,
        /// Bound predecessor proposal hash.
        previous_suggestion_id: String,
        /// Bound replacement proposal hash.
        suggestion_id: String,
    },
}
/// Explicit completeness for this packet, never for an entire room or provider store.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PacketAssetOutcome {
    /// Full native snapshot or conservative source-and-intent causal dependencies.
    Ready {
        /// Unique sorted opaque image bindings; no byte resolution or deletion permission.
        references: Vec<VersionAssetReference>,
    },
    /// Required source operations are absent. This is not an empty complete inventory.
    Pending {
        /// Exact missing source operation ends, preserving the existing proof order.
        missing: Vec<WriterDependency>,
    },
}
/// Native packet read; detached metadata is not independently transferable source authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PacketAssetReferences {
    /// Immutable admitted artifact identity and dependency scope.
    pub packet: PacketAssetIdentity,
    /// Ready or explicitly pending; errors never return a partial prefix.
    pub outcome: PacketAssetOutcome,
}
pub(super) fn admission<T>(value: Result<T, Error>) -> Result<T, Error> {
    value.map_err(|error| match error {
        Error::Limit(_) => Error::Limit("packet asset native admission budget"),
        _ => Error::Contract("packet asset native admission"),
    })
}
pub(super) fn ready(
    pairs: impl IntoIterator<Item = RichAssetReference>,
) -> Result<PacketAssetOutcome, Error> {
    let mut references = BTreeSet::new();
    for pair in pairs {
        references.insert(VersionAssetReference {
            asset: pair.asset().as_str().into(),
            generation: pair.generation().as_str().into(),
        });
        if references.len() > RICH_ASSET_REFERENCE_MAX_BINDINGS {
            return Err(Error::Limit("packet asset reference count"));
        }
    }
    Ok(PacketAssetOutcome::Ready { references: references.into_iter().collect() })
}
struct Counter {
    bytes: usize,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES.saturating_sub(self.bytes) {
            return Err(io::Error::other("packet asset JSON byte budget"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[derive(Serialize)]
struct Schema<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope<'a> {
    format: &'static str,
    format_version: u32,
    schema: Schema<'a>,
    document: &'a str,
    revision: &'a str,
    packet: &'a PacketAssetIdentity,
    outcome: &'a PacketAssetOutcome,
}
pub(super) fn encode(owner: &RichReplica, read: &PacketAssetReferences) -> Result<String, Error> {
    let schema = owner.document().document().schema();
    let value = Envelope {
        format: "breditor/shared-packet-asset-references",
        format_version: 1,
        schema: Schema {
            name: schema.name().as_str(),
            version: schema.version().get(),
            fingerprint: owner.document().document().schema_fingerprint().to_string(),
        },
        document: owner.document_id(),
        revision: &owner.journal.publication,
        packet: &read.packet,
        outcome: &read.outcome,
    };
    serde_json::to_writer(&mut Counter { bytes: 0 }, &value)
        .map_err(|_| Error::Limit("packet asset complete encoded read"))?;
    serde_json::to_string(&value).map_err(|_| Error::Contract("packet asset read encoding"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counter_rejects_the_whole_overflowing_write() {
        let mut counter = Counter { bytes: SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES - 2 };
        assert_eq!(counter.write(b"bad").unwrap_err().kind(), io::ErrorKind::Other);
        assert_eq!(counter.bytes, SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES - 2);
        counter.write_all(b"ok").unwrap();
        assert_eq!(counter.bytes, SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES);
        assert!(counter.write(b"!").is_err());
    }

    #[test]
    fn complete_union_preserves_paired_generations_and_rejects_overflow() {
        let pair =
            |asset: &str, generation: &str| RichAssetReference::try_new(asset, generation).unwrap();
        let PacketAssetOutcome::Ready { references } =
            ready([pair("b", "a"), pair("a", "b"), pair("a", "a"), pair("a", "a")]).unwrap()
        else {
            panic!("A complete union cannot be pending");
        };
        assert_eq!(
            references
                .iter()
                .map(|p| (p.asset.as_str(), p.generation.as_str()))
                .collect::<Vec<_>>(),
            vec![("a", "a"), ("a", "b"), ("b", "a")]
        );
        let pairs =
            (0..=RICH_ASSET_REFERENCE_MAX_BINDINGS).map(|n| pair(&format!("asset-{n}"), "g"));
        assert!(matches!(ready(pairs), Err(Error::Limit("packet asset reference count"))));
    }
}
