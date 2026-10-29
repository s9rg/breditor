//! Separately provisioned test accounts; plaintext remains private host state.
use super::Result;
use breditor_collab_relay::server::Authentication;
use serde_json::json;

pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
pub(super) struct Accounts {
    pub authentication: Authentication,
    pub owner: String,
    pub alice: String,
}
pub(super) fn accounts() -> Result<Accounts> {
    let (owner, owner_hash) = Authentication::issue_token()?;
    let (alice, alice_hash) = Authentication::issue_token()?;
    let authentication = Authentication::from_json(
        &json!({
            "format":"breditor/relay-auth","formatVersion":1,"origins":[ORIGIN],
            "accounts":[{"principal":"owner","tokenHash":owner_hash},
                        {"principal":"alice","tokenHash":alice_hash}]
        })
        .to_string(),
    )?;
    Ok(Accounts { authentication, owner, alice })
}
pub(super) fn operator() -> Result<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((
        Authentication::from_json(
            &json!({
                "format":"breditor/relay-auth","formatVersion":1,"origins":[ORIGIN],
                "accounts":[{"principal":"operator","tokenHash":hash}]
            })
            .to_string(),
        )?,
        token,
    ))
}
