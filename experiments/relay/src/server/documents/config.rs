//! Strict bounded `breditor/relay-document-api` V1 host configuration. Every capability is off
//! unless this file explicitly names it; there is no implicit creator, injector or webhook.
use crate::{Error, Result, access};
use serde::Deserialize;
use std::collections::BTreeSet;

pub(super) const EVENTS: [&str; 5] =
    ["document.changed", "comment.created", "comment.resolved", "room.created", "room.deleted"];
/// Native command kinds the injection endpoint admits. Everything else is refused before any
/// replica work, so the server-side surface stays a small, reviewed subset of shared commands.
pub(super) const INJECTABLE: [&str; 10] = [
    "insert_blocks",
    "replace_text_range",
    "insert_text",
    "delete_text",
    "set_heading",
    "set_block_layout",
    "set_task_checked",
    "set_code_language",
    "set_image_alt",
    "delete_block",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Raw {
    format: String,
    format_version: u32,
    #[serde(default)]
    service_principal: Option<String>,
    #[serde(default)]
    creators: Vec<String>,
    #[serde(default)]
    administrators: Vec<String>,
    #[serde(default)]
    injection: RawInjection,
    #[serde(default)]
    limits: RawLimits,
    #[serde(default)]
    webhooks: RawWebhooks,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawInjection {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    injectors: Vec<String>,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawLimits {
    max_rooms: Option<usize>,
    max_request_bytes: Option<usize>,
    max_commands: Option<usize>,
    concurrent_operations: Option<usize>,
    deadline_millis: Option<u64>,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawWebhooks {
    debounce_millis: Option<u64>,
    max_attempts: Option<u32>,
    retry_base_millis: Option<u64>,
    timeout_millis: Option<u64>,
    queue_capacity: Option<usize>,
    #[serde(default)]
    endpoints: Vec<RawEndpoint>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawEndpoint {
    id: String,
    url: String,
    secret: String,
    events: Vec<String>,
}

/// Bounded resource limits for the document API. Defaults are conservative correctness budgets,
/// not a public-host capacity claim.
#[derive(Clone, Debug)]
pub(super) struct Limits {
    pub max_rooms: usize,
    pub max_request_bytes: usize,
    pub max_commands: usize,
    pub concurrent_operations: usize,
    pub deadline: std::time::Duration,
}
#[derive(Clone, Debug)]
pub(super) struct Endpoint {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub secret: Vec<u8>,
    pub events: BTreeSet<String>,
}
#[derive(Clone, Debug)]
pub(super) struct Webhooks {
    pub debounce: std::time::Duration,
    pub max_attempts: u32,
    pub retry_base: std::time::Duration,
    pub timeout: std::time::Duration,
    pub queue_capacity: usize,
    pub endpoints: Vec<Endpoint>,
}

/// Compiled opt-in document API configuration (`breditor/relay-document-api` V1).
#[derive(Clone, Debug)]
pub struct DocumentServerConfiguration {
    pub(super) service_principal: Option<String>,
    pub(super) creators: BTreeSet<String>,
    pub(super) administrators: BTreeSet<String>,
    pub(super) injection: bool,
    pub(super) injectors: BTreeSet<String>,
    pub(super) limits: Limits,
    pub(super) webhooks: Webhooks,
}

fn principals(values: Vec<String>) -> Result<BTreeSet<String>> {
    if values.len() > 1024 {
        return Err(Error::Contract("document API principal list budget"));
    }
    let mut set = BTreeSet::new();
    for value in values {
        access::principal(&value)?;
        if !set.insert(value) {
            return Err(Error::Contract("duplicate document API principal"));
        }
    }
    Ok(set)
}
fn bounded<T: PartialOrd + Copy>(value: Option<T>, default: T, min: T, max: T) -> Result<T> {
    let value = value.unwrap_or(default);
    if value < min || value > max {
        return Err(Error::Contract("document API limit out of range"));
    }
    Ok(value)
}
/// Plain `http://host[:port]/path` only. TLS termination belongs to a separate forwarder; the
/// reference relay never follows redirects or resolves caller-supplied URLs.
fn endpoint_url(url: &str) -> Result<(String, u16, String)> {
    let invalid = Error::Contract("webhook endpoint URL");
    if url.len() > 2048 || !url.is_ascii() || url.bytes().any(|b| b.is_ascii_control() || b == b' ')
    {
        return Err(invalid);
    }
    let rest = url.strip_prefix("http://").ok_or(Error::Contract("webhook endpoint URL"))?;
    let (authority, path) = rest.find('/').map_or((rest, "/"), |at| (&rest[..at], &rest[at..]));
    if authority.is_empty() || authority.contains('@') || path.contains('#') {
        return Err(invalid);
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) if !host.ends_with(']') || host.starts_with('[') => {
            (host, port.parse::<u16>().map_err(|_| Error::Contract("webhook endpoint port"))?)
        }
        _ => (authority, 80),
    };
    if host.is_empty() || port == 0 {
        return Err(invalid);
    }
    Ok((host.into(), port, path.into()))
}

impl DocumentServerConfiguration {
    /// Compile a bounded host-private configuration file.
    /// # Errors
    /// Rejects unknown fields/versions, invalid principals, out-of-range limits, unsupported
    /// webhook URLs/events, short secrets, duplicate endpoints, or injection without a service
    /// principal.
    pub fn from_json(input: &str) -> Result<Self> {
        if input.len() > 256 * 1024 {
            return Err(Error::Contract("document API configuration budget"));
        }
        let raw: Raw = serde_json::from_str(input)?;
        if raw.format != "breditor/relay-document-api" || raw.format_version != 1 {
            return Err(Error::Contract("document API configuration"));
        }
        if let Some(service) = &raw.service_principal {
            access::principal(service)?;
        }
        if raw.injection.enabled && raw.service_principal.is_none() {
            return Err(Error::Contract("injection requires a service principal"));
        }
        let limits = Limits {
            max_rooms: bounded(raw.limits.max_rooms, 64, 1, 256)?,
            max_request_bytes: bounded(
                raw.limits.max_request_bytes,
                1024 * 1024,
                1024,
                4 * 1024 * 1024,
            )?,
            max_commands: bounded(raw.limits.max_commands, 32, 1, 64)?,
            concurrent_operations: bounded(raw.limits.concurrent_operations, 4, 1, 16)?,
            deadline: std::time::Duration::from_millis(bounded(
                raw.limits.deadline_millis,
                10_000,
                100,
                60_000,
            )?),
        };
        let w = raw.webhooks;
        if w.endpoints.len() > 16 {
            return Err(Error::Contract("webhook endpoint budget"));
        }
        let mut ids = BTreeSet::new();
        let mut endpoints = Vec::new();
        for endpoint in w.endpoints {
            if endpoint.id.is_empty()
                || endpoint.id.len() > 64
                || !endpoint.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                || !ids.insert(endpoint.id.clone())
            {
                return Err(Error::Contract("webhook endpoint identity"));
            }
            if endpoint.secret.len() < 32 || endpoint.secret.len() > 512 {
                return Err(Error::Contract("webhook secret must be 32 to 512 bytes"));
            }
            let mut events = BTreeSet::new();
            for event in endpoint.events {
                if !EVENTS.contains(&event.as_str()) || !events.insert(event) {
                    return Err(Error::Contract("webhook event"));
                }
            }
            if events.is_empty() {
                return Err(Error::Contract("webhook event"));
            }
            let (host, port, path) = endpoint_url(&endpoint.url)?;
            endpoints.push(Endpoint {
                id: endpoint.id,
                host,
                port,
                path,
                secret: endpoint.secret.into_bytes(),
                events,
            });
        }
        Ok(Self {
            service_principal: raw.service_principal,
            creators: principals(raw.creators)?,
            administrators: principals(raw.administrators)?,
            injection: raw.injection.enabled,
            injectors: principals(raw.injection.injectors)?,
            limits,
            webhooks: Webhooks {
                debounce: std::time::Duration::from_millis(bounded(
                    w.debounce_millis,
                    2_000,
                    0,
                    60_000,
                )?),
                max_attempts: bounded(w.max_attempts, 5, 1, 10)?,
                retry_base: std::time::Duration::from_millis(bounded(
                    w.retry_base_millis,
                    1_000,
                    1,
                    60_000,
                )?),
                timeout: std::time::Duration::from_millis(bounded(
                    w.timeout_millis,
                    5_000,
                    50,
                    30_000,
                )?),
                queue_capacity: bounded(w.queue_capacity, 256, 1, 4096)?,
                endpoints,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn base() -> serde_json::Value {
        json!({"format":"breditor/relay-document-api","formatVersion":1})
    }
    #[test]
    fn defaults_enable_nothing_and_invalid_inputs_reject() -> Result<()> {
        let config = DocumentServerConfiguration::from_json(&base().to_string())?;
        assert!(!config.injection && config.creators.is_empty());
        assert!(config.webhooks.endpoints.is_empty());
        for variant in 0..8 {
            let mut c = base();
            match variant {
                0 => c["formatVersion"] = json!(2),
                1 => c["extra"] = json!(1),
                2 => c["injection"] = json!({"enabled":true}),
                3 => c["limits"] = json!({"maxRooms":0}),
                4 => {
                    c["webhooks"] = json!({"endpoints":[{"id":"a","url":"https://x/","secret":"s".repeat(32),"events":["room.created"]}]});
                }
                5 => {
                    c["webhooks"] = json!({"endpoints":[{"id":"a","url":"http://x/","secret":"short","events":["room.created"]}]});
                }
                6 => {
                    c["webhooks"] = json!({"endpoints":[{"id":"a","url":"http://x/","secret":"s".repeat(32),"events":["unknown"]}]});
                }
                _ => c["creators"] = json!(["a", "a"]),
            }
            assert!(DocumentServerConfiguration::from_json(&c.to_string()).is_err(), "{variant}");
        }
        Ok(())
    }
    #[test]
    fn endpoint_urls_are_plain_http_without_credentials() -> Result<()> {
        assert_eq!(
            endpoint_url("http://127.0.0.1:9/h?x=1")?,
            ("127.0.0.1".into(), 9, "/h?x=1".into())
        );
        assert_eq!(endpoint_url("http://example.test")?, ("example.test".into(), 80, "/".into()));
        assert!(endpoint_url("http://u:p@host/").is_err());
        assert!(endpoint_url("ftp://host/").is_err());
        assert!(endpoint_url("http://host:0/").is_err());
        Ok(())
    }
}
