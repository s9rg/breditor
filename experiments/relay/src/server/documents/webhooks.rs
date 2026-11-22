//! Signed, bounded, asynchronous webhook delivery. Emitting never awaits network I/O or a room
//! lock: a full per-endpoint queue records a dropped delivery instead of applying backpressure.
use super::config::{Endpoint, Webhooks as Settings};
use crate::{Result, credentials};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    fmt::Write as _,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::mpsc,
};

/// Request header carrying `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
pub const WEBHOOK_SIGNATURE_HEADER: &str = "x-breditor-signature";
const MAX_LOG: usize = 512;
const MAX_BACKOFF: Duration = Duration::from_secs(300);

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0_u8; 64];
    if key.len() > 64 {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut inner = Sha256::new();
    inner.update(block.map(|b| b ^ 0x36));
    inner.update(message);
    let inner = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(block.map(|b| b ^ 0x5c));
    outer.update(inner);
    outer.finalize().into()
}
fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(out, "{b:02x}");
    }
    out
}
fn signed_payload(timestamp: u64, body: &[u8]) -> Vec<u8> {
    let mut payload = format!("{timestamp}.").into_bytes();
    payload.extend_from_slice(body);
    payload
}
/// Compute the signature header value for one delivery attempt.
#[must_use]
pub fn sign_webhook(secret: &[u8], timestamp: u64, body: &[u8]) -> String {
    format!("t={timestamp},v1={}", hex(&hmac_sha256(secret, &signed_payload(timestamp, body))))
}
/// Verify a received webhook: exact HMAC over `"<t>.<raw body>"` and `|now - t| <= tolerance`.
/// Receivers should additionally remember `x-breditor-webhook-id` values for the tolerance window
/// to drop replays of a still-fresh delivery. Comparison is constant-time over the digest.
#[must_use]
pub fn verify_webhook_signature(
    secret: &[u8],
    header: &str,
    body: &[u8],
    now_unix: u64,
    tolerance_seconds: u64,
) -> bool {
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in header.split(',') {
        match part.trim().split_once('=') {
            Some(("t", value)) if timestamp.is_none() => timestamp = value.parse::<u64>().ok(),
            Some(("v1", value)) => signatures.push(value),
            _ => {}
        }
    }
    let Some(timestamp) = timestamp else { return false };
    if now_unix.abs_diff(timestamp) > tolerance_seconds {
        return false;
    }
    let expected = hex(&hmac_sha256(secret, &signed_payload(timestamp, body)));
    signatures.iter().any(|candidate| {
        candidate.len() == expected.len()
            && candidate.bytes().zip(expected.bytes()).fold(0_u8, |acc, (a, b)| acc | (a ^ b)) == 0
    })
}
pub(super) fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// One retained delivery-log entry. Never contains the secret or the document content.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeliveryRecord {
    delivery: String,
    endpoint: String,
    event: String,
    attempt: u32,
    outcome: &'static str,
    status: Option<u16>,
    at: u64,
}
struct Delivery {
    id: String,
    event: String,
    body: Arc<Vec<u8>>,
}
#[derive(Clone)]
pub(super) struct Webhooks {
    endpoints: Arc<Vec<(Arc<Endpoint>, mpsc::Sender<Delivery>)>>,
    log: Arc<Mutex<VecDeque<DeliveryRecord>>>,
}
impl Webhooks {
    /// Start one sequential worker per endpoint. Must run inside a Tokio runtime.
    pub(super) fn start(settings: &Settings) -> Self {
        let log = Arc::new(Mutex::new(VecDeque::new()));
        let mut endpoints = Vec::new();
        for endpoint in &settings.endpoints {
            let endpoint = Arc::new(endpoint.clone());
            let (sender, receiver) = mpsc::channel(settings.queue_capacity);
            tokio::spawn(worker(endpoint.clone(), settings.clone(), receiver, log.clone()));
            endpoints.push((endpoint, sender));
        }
        Self { endpoints: Arc::new(endpoints), log }
    }
    pub(super) fn active(&self) -> bool {
        !self.endpoints.is_empty()
    }
    pub(super) fn wants(&self, event: &str) -> bool {
        self.endpoints.iter().any(|(endpoint, _)| endpoint.events.contains(event))
    }
    /// Queue one event without blocking. Payloads carry identifiers, never document content.
    pub(super) fn emit(&self, event: &str, room: &str, data: &Value) -> Result<()> {
        if !self.wants(event) {
            return Ok(());
        }
        let id = credentials::issue()?;
        let body = Arc::new(serde_json::to_vec(&json!({
            "format": "breditor/relay-webhook",
            "formatVersion": 1,
            "id": id,
            "event": event,
            "occurredAt": now_unix(),
            "room": room,
            "data": data,
        }))?);
        for (endpoint, sender) in self.endpoints.iter() {
            if !endpoint.events.contains(event) {
                continue;
            }
            let delivery = Delivery { id: id.clone(), event: event.into(), body: body.clone() };
            if sender.try_send(delivery).is_err() {
                record(&self.log, &id, &endpoint.id, event, 0, "dropped", None);
            }
        }
        Ok(())
    }
    pub(super) fn deliveries(&self) -> Vec<DeliveryRecord> {
        self.log.lock().map(|log| log.iter().cloned().collect()).unwrap_or_default()
    }
}
fn record(
    log: &Mutex<VecDeque<DeliveryRecord>>,
    delivery: &str,
    endpoint: &str,
    event: &str,
    attempt: u32,
    outcome: &'static str,
    status: Option<u16>,
) {
    if let Ok(mut log) = log.lock() {
        if log.len() >= MAX_LOG {
            log.pop_front();
        }
        log.push_back(DeliveryRecord {
            delivery: delivery.into(),
            endpoint: endpoint.into(),
            event: event.into(),
            attempt,
            outcome,
            status,
            at: now_unix(),
        });
    }
}
async fn worker(
    endpoint: Arc<Endpoint>,
    settings: Settings,
    mut receiver: mpsc::Receiver<Delivery>,
    log: Arc<Mutex<VecDeque<DeliveryRecord>>>,
) {
    while let Some(delivery) = receiver.recv().await {
        for attempt in 1..=settings.max_attempts {
            let status =
                match tokio::time::timeout(settings.timeout, post(&endpoint, &delivery, attempt))
                    .await
                {
                    Ok(Ok(status)) => Some(status),
                    _ => None,
                };
            let delivered = status.is_some_and(|s| (200..300).contains(&s));
            let outcome = if delivered {
                "delivered"
            } else if attempt == settings.max_attempts {
                "abandoned"
            } else {
                "retrying"
            };
            record(&log, &delivery.id, &endpoint.id, &delivery.event, attempt, outcome, status);
            if delivered || attempt == settings.max_attempts {
                break;
            }
            let backoff = settings.retry_base.saturating_mul(1_u32 << (attempt - 1).min(16));
            tokio::time::sleep(backoff.min(MAX_BACKOFF)).await;
        }
    }
}
/// Minimal HTTP/1.1 POST with `Connection: close`; only the status line is read (bounded).
async fn post(endpoint: &Endpoint, delivery: &Delivery, attempt: u32) -> std::io::Result<u16> {
    let host = endpoint.host.trim_start_matches('[').trim_end_matches(']');
    let mut stream = tokio::net::TcpStream::connect((host, endpoint.port)).await?;
    let signature = sign_webhook(&endpoint.secret, now_unix(), &delivery.body);
    let head = format!(
        "POST {} HTTP/1.1\r\nhost: {}:{}\r\nuser-agent: breditor-relay-webhook/1\r\n\
         content-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\
         x-breditor-webhook-id: {}\r\nx-breditor-webhook-event: {}\r\n\
         x-breditor-webhook-attempt: {attempt}\r\n{WEBHOOK_SIGNATURE_HEADER}: {signature}\r\n\r\n",
        endpoint.path,
        endpoint.host,
        endpoint.port,
        delivery.body.len(),
        delivery.id,
        delivery.event,
    );
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(&delivery.body).await?;
    stream.flush().await?;
    let mut response = Vec::with_capacity(256);
    let mut buffer = [0_u8; 512];
    while !response.windows(2).any(|w| w == b"\r\n") {
        let read = stream.read(&mut buffer).await?;
        if read == 0 || response.len() > 8 * 1024 {
            break;
        }
        response.extend_from_slice(&buffer[..read]);
    }
    let line = String::from_utf8_lossy(&response);
    line.split_whitespace()
        .nth(1)
        .filter(|_| line.starts_with("HTTP/1."))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| std::io::Error::other("malformed webhook response"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hmac_matches_rfc4231_and_signatures_verify_within_the_window() {
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        let long_key = [0xaa_u8; 131];
        assert_eq!(
            hex(&hmac_sha256(&long_key, b"Test Using Larger Than Block-Size Key - Hash Key First")),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
        let header = sign_webhook(b"secret", 1_000, b"{}");
        assert!(verify_webhook_signature(b"secret", &header, b"{}", 1_200, 300));
        assert!(!verify_webhook_signature(b"secret", &header, b"{}", 1_400, 300));
        assert!(!verify_webhook_signature(b"other", &header, b"{}", 1_000, 300));
        assert!(!verify_webhook_signature(b"secret", &header, b"{ }", 1_000, 300));
        assert!(!verify_webhook_signature(b"secret", "v1=00", b"{}", 1_000, 300));
    }
}
