//! Authenticated, binding-scoped HTTP access to one native review thread's attachment.
mod publish;
mod read;

use super::{
    Host,
    http::{cors, failure, origin},
    versions::account,
};
use crate::{Error, Result};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use breditor_collab_feasibility::review::{ReviewActorId, ReviewEventId, ReviewThreadId};
pub(super) use publish::publish;
pub(super) use read::{discover, download};
use serde::Serialize;

const CONTENT_TYPE: &str = "application/vnd.breditor.recovered-discussion+json";

struct Access {
    principal: String,
    binding: String,
    thread: ReviewThreadId,
}
impl Access {
    fn read(host: &Host, headers: &HeaderMap, (actor, counter): (String, String)) -> Result<Self> {
        let principal = account(host, headers)?;
        let binding = header(headers, "x-breditor-review")?;
        decode_sha256(binding)?;
        let position =
            counter.parse::<u64>().map_err(|_| Error::Contract("invalid discussion counter"))?;
        if position.to_string() != counter {
            return Err(Error::Contract("invalid discussion counter"));
        }
        let event = ReviewEventId::try_new(ReviewActorId::try_new(&actor)?, position)?;
        Ok(Self { principal, binding: binding.into(), thread: ReviewThreadId::from_event(event) })
    }
}

fn header<'a>(headers: &'a HeaderMap, name: &'static str) -> Result<&'a str> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or(Error::Contract("required recovered discussion header"))
}

fn decode_sha256(text: &str) -> Result<[u8; 32]> {
    if text.len() != 64 || !text.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err(Error::Contract("invalid recovered discussion digest"));
    }
    let mut value = [0; 32];
    let (pairs, _) = text.as_bytes().as_chunks::<2>();
    for (part, out) in pairs.iter().zip(&mut value) {
        *out = u8::from_str_radix(std::str::from_utf8(part).map_err(|_| Error::NeedsRecovery)?, 16)
            .map_err(|_| Error::NeedsRecovery)?;
    }
    Ok(value)
}

fn entry_response(entry: impl Serialize) -> Response {
    match serde_json::to_string(&serde_json::json!({
        "format": "breditor/relay-recovered-discussion",
        "formatVersion": 1,
        "entry": entry,
    })) {
        Ok(value) => ([("content-type", "application/json")], value).into_response(),
        Err(error) => failure(&error.into()),
    }
}

pub(super) async fn preflight(State(host): State<Host>, headers: HeaderMap) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let method = headers.get("access-control-request-method").and_then(|h| h.to_str().ok());
    let requested = headers.get("access-control-request-headers").and_then(|h| h.to_str().ok());
    let valid = requested.is_none_or(|value| {
        value.split(',').all(|name| {
            matches!(
                name.trim().to_ascii_lowercase().as_str(),
                "authorization"
                    | "x-breditor-principal"
                    | "x-breditor-principal-utf8"
                    | "x-breditor-review"
                    | "x-breditor-archive"
                    | "content-type"
            )
        })
    });
    let response = if matches!(method, Some("GET" | "POST")) && valid {
        (
            StatusCode::NO_CONTENT,
            [
                ("access-control-allow-methods", "GET, POST"),
                ("access-control-allow-headers",
                "Authorization, X-Breditor-Principal, X-Breditor-Principal-Utf8, X-Breditor-Review, X-Breditor-Archive, Content-Type"),
            ],
        ).into_response()
    } else {
        StatusCode::FORBIDDEN.into_response()
    };
    cors(response, allowed)
}
