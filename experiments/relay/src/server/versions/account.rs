//! Explicit UTF-8 identity header; the original plain principal header keeps its exact meaning.
use super::{HeaderMap, Host};
use crate::{Error, Result};
fn decoded(value: &str) -> Result<String> {
    if value.len() > 384 {
        return Err(Error::Permission);
    }
    let mut bytes = Vec::new();
    let input = value.as_bytes();
    let mut at = 0;
    while at < input.len() {
        let byte = if input[at] == b'%' {
            let pair = input.get(at + 1..at + 3).ok_or(Error::Permission)?;
            let high = (pair[0] as char).to_digit(16).ok_or(Error::Permission)?;
            let low = (pair[1] as char).to_digit(16).ok_or(Error::Permission)?;
            at += 3;
            u8::try_from(high * 16 + low).map_err(|_| Error::Permission)?
        } else {
            let byte = input[at];
            at += 1;
            byte
        };
        bytes.push(byte);
        if bytes.len() > 128 {
            return Err(Error::Permission);
        }
    }
    let principal = String::from_utf8(bytes).map_err(|_| Error::Permission)?;
    if principal.trim().is_empty() || principal.chars().any(char::is_control) {
        return Err(Error::Permission);
    }
    Ok(principal)
}
pub(in crate::server) fn account(host: &Host, headers: &HeaderMap) -> Result<String> {
    let Some(encoded) = headers.get("x-breditor-principal-utf8") else {
        return super::super::http::account(host, headers);
    };
    if headers.contains_key("x-breditor-principal") {
        return Err(Error::Permission);
    }
    let principal = decoded(encoded.to_str().map_err(|_| Error::Permission)?)?;
    let token = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or(Error::Permission)?;
    host.authentication.authenticate(&principal, token)?;
    Ok(principal)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn utf8_identity_decoding_is_explicit_bounded_and_never_treats_plus_as_space() -> Result<()> {
        assert_eq!(decoded("%E5%88%9D%E7%A8%BF%20%F0%9F%99%82")?, "初稿 🙂");
        assert_eq!(decoded("a+b%25")?, "a+b%");
        for value in ["%", "%0", "%GG", "%80", "%0A", "%00", ""] {
            assert!(decoded(value).is_err());
        }
        assert!(decoded(&"%41".repeat(129)).is_err());
        Ok(())
    }
}
