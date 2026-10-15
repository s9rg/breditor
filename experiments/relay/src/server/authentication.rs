//! Host-configured account authentication, separate from durable room permission and writers.
use crate::{Error, Result, access, credentials};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Account {
    principal: String,
    token_hash: [u8; 32],
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Configuration {
    format: String,
    format_version: u32,
    accounts: Vec<Account>,
    origins: Vec<String>,
}

/// Explicit loopback reference-host account tokens and exact browser-Origin allowlist.
/// Only token digests are retained. Use a separately provisioned 256-bit token for each account.
/// This adapter is not an identity-provider integration, cookie login or public deployment policy.
pub struct Authentication {
    accounts: BTreeMap<String, [u8; 32]>,
    origins: BTreeSet<String>,
}
impl Authentication {
    /// Compile bounded original `breditor/relay-auth` V1 host configuration.
    /// # Errors
    /// Rejects unknown fields/versions, duplicate account identities/tokens and wildcard/null origins.
    pub fn from_json(input: &str) -> Result<Self> {
        if input.len() > 256 * 1024 {
            return Err(Error::Contract("authentication configuration budget"));
        }
        let c: Configuration = serde_json::from_str(input)?;
        if c.format != "breditor/relay-auth"
            || c.format_version != 1
            || c.accounts.is_empty()
            || c.accounts.len() > 1024
            || c.origins.is_empty()
            || c.origins.len() > 32
        {
            return Err(Error::Contract("authentication configuration"));
        }
        let mut accounts = BTreeMap::new();
        let mut hashes = BTreeSet::new();
        for account in c.accounts {
            access::principal(&account.principal)?;
            if !hashes.insert(account.token_hash)
                || accounts.insert(account.principal, account.token_hash).is_some()
            {
                return Err(Error::Contract("duplicate account identity or token"));
            }
        }
        let mut origins = BTreeSet::new();
        for origin in c.origins {
            if origin.len() > 256
                || !origin.is_ascii()
                || origin.contains(['\r', '\n', '*'])
                || !(origin.starts_with("http://") || origin.starts_with("https://"))
                || !origins.insert(origin)
            {
                return Err(Error::Contract("exact browser origin required"));
            }
        }
        Ok(Self { accounts, origins })
    }
    pub(super) fn origin(&self, origin: &str) -> bool {
        self.origins.contains(origin)
    }
    pub(super) fn authenticate(&self, principal: &str, token: &str) -> Result<()> {
        access::principal(principal).map_err(|_| Error::Permission)?;
        let digest = credentials::hash(token).map_err(|_| Error::Permission)?;
        if self.accounts.get(principal) == Some(&digest) { Ok(()) } else { Err(Error::Permission) }
    }
    /// Generate a new account bearer token and its config digest. Display/save the secret only to
    /// its account; keep it separate from room resume credentials and portable document journals.
    /// # Errors
    /// Rejects unavailable operating-system entropy.
    pub fn issue_token() -> Result<(String, [u8; 32])> {
        let token = credentials::issue()?;
        let digest = credentials::hash(&token)?;
        Ok((token, digest))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn configuration() -> serde_json::Value {
        json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:49774"],
            "accounts":[{"principal":"alice","tokenHash":credentials::hash(&"a".repeat(64)).expect("test credential")} ]})
    }
    #[test]
    fn account_authentication_is_distinct_from_origin_and_writer_ownership() -> Result<()> {
        let auth = Authentication::from_json(&configuration().to_string())?;
        auth.authenticate("alice", &"a".repeat(64))?;
        assert!(auth.authenticate("alice", &"b".repeat(64)).is_err());
        assert!(auth.authenticate("bob", &"a".repeat(64)).is_err());
        assert!(auth.origin("http://127.0.0.1:49774"));
        assert!(!auth.origin("http://localhost:49774"));
        assert!(!auth.origin("null"));
        Ok(())
    }
    #[test]
    fn malformed_duplicate_accounts_and_wildcard_origins_reject() {
        for variant in 0..5 {
            let mut c = configuration();
            match variant {
                0 => c["extra"] = json!(true),
                1 => c["formatVersion"] = json!(99),
                2 => {
                    let duplicate = c["accounts"][0].clone();
                    c["accounts"].as_array_mut().expect("test accounts").push(duplicate);
                }
                3 => c["origins"] = json!(["*"]),
                _ => c["origins"] = json!(["null"]),
            }
            assert!(Authentication::from_json(&c.to_string()).is_err());
        }
    }
}
