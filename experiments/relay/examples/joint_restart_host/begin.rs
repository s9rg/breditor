//! Parse explicit fixture flags and prepare genuine owners before serving.
use super::{Result, setup, source};
use tokio::net::TcpListener;
pub(super) async fn prepare() -> Result<(setup::Ready, TcpListener, TcpListener)> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let suggestions = args.last().is_some_and(|value| value == "suggestion-grants-v1");
    let selected = if suggestions { &args[..args.len() - 1] } else { args.as_slice() };
    let [parent, language, standard, atomic] = selected else {
        return Err("expected private parent, language1/2/3, standard0/1, atomic0/1".into());
    };
    let flag = |value: &str| -> Result<bool> {
        match value {
            "0" => Ok(false),
            "1" => Ok(true),
            _ => Err("explicit0/1 fixture flag".into()),
        }
    };
    let spec = source::Spec {
        language: language.parse()?,
        standard: flag(standard)?,
        atomic: flag(atomic)?,
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("private fixture parent must exist".into());
    }
    let images =
        [std::fs::read(parent.join("seed-a.png"))?, std::fs::read(parent.join("seed-b.png"))?];
    // Pin the actual socket BEFORE any SDK source can be created with its binding.
    let clients = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let retired = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let ready = if suggestions {
        Box::pin(setup::prepare_with_suggestion_grants(&parent, spec, &images)).await?
    } else {
        Box::pin(setup::prepare(&parent, spec, &images)).await?
    };
    Ok((ready, clients, retired))
}
