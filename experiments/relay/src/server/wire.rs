//! Strict bounded request envelopes. Writer authority is connection state, never a submission field.
use crate::{Error, Result, Role};
use serde::Deserialize;
use serde_json::{Value, json};

pub(super) const MAX_MESSAGE: usize = 6 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Request {
    Authenticate { principal: String, token: String },
    Register,
    Resume { writer: String, credential: String },
    Submit { group: String },
    Sync,
    Clock { writer: String },
    Grant { principal: String, role: Option<Role> },
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Envelope {
    format: String,
    format_version: u32,
    pub id: String,
    pub request: Request,
}
impl Envelope {
    pub fn decode(input: &str) -> Result<Self> {
        if input.len() > MAX_MESSAGE {
            return Err(Error::Contract("relay message budget"));
        }
        let e: Self = serde_json::from_str(input)?;
        if e.format != "breditor/relay"
            || e.format_version != 1
            || e.id.is_empty()
            || e.id.len() > 64
            || e.id.chars().any(char::is_control)
        {
            return Err(Error::Contract("relay envelope"));
        }
        Ok(e)
    }
}
pub(super) fn reply(id: Option<&str>, result: &Value) -> String {
    json!({"format":"breditor/relay","formatVersion":1,"id":id,"result":result}).to_string()
}
pub(super) fn error(error: &Error) -> Value {
    // Never echo tokens, raw engine payloads, filesystem paths or internal parse diagnostics.
    let code = match error {
        Error::Permission => "permission_denied",
        Error::Lease => "lease_rejected",
        Error::NeedsRecovery | Error::Io(_) | Error::Locked => "storage_unavailable",
        Error::Entropy => "entropy_unavailable",
        Error::Core(_) => "group_rejected",
        Error::Contract(_) | Error::Json(_) => "invalid_request",
    };
    json!({"kind":"error","code":code})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_bind_versions_and_never_accept_payload_writer_authority() -> Result<()> {
        let good = json!({"format":"breditor/relay","formatVersion":1,"id":"1","request":{"kind":"submit","group":"opaque"}});
        Envelope::decode(&good.to_string())?;
        for variant in 0..4 {
            let mut value = good.clone();
            match variant {
                0 => value["formatVersion"] = json!(2),
                1 => value["id"] = json!(""),
                2 => value["request"]["writer"] = json!("other"),
                _ => value["request"]["lease"] = json!("forged"),
            }
            assert!(Envelope::decode(&value.to_string()).is_err());
        }
        assert_eq!(error(&Error::Permission), json!({"kind":"error","code":"permission_denied"}));
        Ok(())
    }
}
