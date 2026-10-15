//! Bounded ephemeral latest-per-writer selections. Never serialized into the room log.
use crate::{Error, Result, assets::asset_id};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
const MAX_PEERS: usize = 64;
const MAX_BYTES: usize = 2 * 1024 * 1024;
const MAX_FRAME: usize = 256 * 1024;
const TTL: Duration = Duration::from_secs(30);

/// Host-authenticated current writer session and its latest opaque causal selection.
/// The session is a public hash-derived epoch, never the private writer lease token.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresencePeer {
    /// Account-owned causal writer.
    pub writer: String,
    /// Public connection epoch, replaced on resume.
    pub session: String,
    /// Authenticated principal, not caller-supplied packet display metadata.
    pub label: String,
    /// Exact canonical unsigned sequence, local to this connection epoch.
    pub sequence: String,
    /// Bounded original causal frame, validated without importing document operations.
    pub frame: String,
}
struct Entry {
    peer: PresencePeer,
    sequence: u64,
    received: Instant,
    expired: bool,
}
#[derive(Default)]
pub(crate) struct Presence {
    entries: BTreeMap<String, Entry>,
    bytes: usize,
}
pub(crate) fn session(token: &str) -> String {
    let value = asset_id(format!("breditor/public-presence-session/1:{token}").as_bytes());
    value[7..].into()
}
fn sequence(value: &str) -> Result<u64> {
    let parsed = value.parse::<u64>().map_err(|_| Error::Contract("presence sequence"))?;
    if parsed.to_string() != value {
        return Err(Error::Contract("canonical presence sequence"));
    }
    Ok(parsed)
}
impl Presence {
    pub fn remove(&mut self, writer: &str) -> bool {
        if let Some(old) = self.entries.remove(writer) {
            self.bytes -= old.peer.frame.len();
            true
        } else {
            false
        }
    }
    fn expire(&mut self, now: Instant) {
        for entry in self.entries.values_mut() {
            if !entry.expired && now.saturating_duration_since(entry.received) >= TTL {
                self.bytes -= entry.peer.frame.len();
                entry.peer.frame.clear();
                entry.expired = true;
            }
        }
    }
    pub fn publish(&mut self, peer: PresencePeer, now: Instant) -> Result<bool> {
        let next = sequence(&peer.sequence)?;
        if peer.frame.len() > MAX_FRAME {
            return Err(Error::Contract("presence frame budget"));
        }
        self.expire(now);
        let old = self.entries.get(&peer.writer);
        if old.is_some_and(|e| e.peer.session == peer.session && e.sequence >= next) {
            return Ok(false);
        }
        if self.entries.len() >= 1024 && old.is_none() {
            return Err(Error::Contract("presence session budget"));
        }
        if old.is_none_or(|e| e.expired)
            && self.entries.values().filter(|e| !e.expired).count() >= MAX_PEERS
        {
            return Err(Error::Contract("presence peer budget"));
        }
        let bytes = self.bytes - old.map_or(0, |e| e.peer.frame.len()) + peer.frame.len();
        if bytes > MAX_BYTES {
            return Err(Error::Contract("presence byte budget"));
        }
        self.bytes = bytes;
        self.entries.insert(
            peer.writer.clone(),
            Entry { peer, sequence: next, received: now, expired: false },
        );
        Ok(true)
    }
    pub fn snapshot(&mut self, now: Instant) -> Vec<PresencePeer> {
        self.expire(now);
        self.entries.values().filter(|e| !e.expired).map(|e| e.peer.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn peer(sequence: &str) -> PresencePeer {
        PresencePeer {
            writer: "2".into(),
            session: "epoch".into(),
            label: "alice".into(),
            sequence: sequence.into(),
            frame: "opaque".into(),
        }
    }
    #[test]
    fn exact_sequences_do_not_refresh_expiry_and_public_epochs_are_not_credentials() -> Result<()> {
        let now = Instant::now();
        let mut p = Presence::default();
        assert!(p.publish(peer("9007199254740993"), now)?);
        assert!(!p.publish(peer("9007199254740992"), now + Duration::from_secs(29))?);
        assert!(p.snapshot(now + TTL).is_empty());
        assert_eq!(p.bytes, 0);
        assert!(!p.publish(peer("9007199254740992"), now + TTL)?);
        assert!(p.snapshot(now + TTL).is_empty());
        let token = "a".repeat(64);
        let epoch = session(&token);
        assert_eq!(epoch.len(), 64);
        assert_ne!(epoch, token);
        assert_ne!(epoch, session(&"b".repeat(64)));
        assert!(p.publish(peer("01"), now).is_err());
        Ok(())
    }
    #[test]
    fn replacement_and_budgets_keep_only_latest_bounded_bytes() -> Result<()> {
        let now = Instant::now();
        let mut p = Presence::default();
        p.publish(peer("9"), now)?;
        let mut new = peer("1");
        new.session = "new-epoch".into();
        new.frame = "new".into();
        p.publish(new, now)?;
        assert_eq!(p.snapshot(now)[0].frame, "new");
        assert_eq!(p.bytes, 3);
        let before = p.bytes;
        let mut large = peer("10");
        large.frame = "x".repeat(MAX_FRAME + 1);
        assert!(p.publish(large, now).is_err());
        assert_eq!(p.bytes, before);
        assert!(p.remove("2"));
        assert!(!p.remove("2"));
        assert_eq!(p.bytes, 0);
        Ok(())
    }
}
