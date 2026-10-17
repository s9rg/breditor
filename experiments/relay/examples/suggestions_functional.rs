//! Isolated native suggestion socket probe host and real native author fixture. Never touches a live room.
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{DocumentSuggestionDraft, SharedRichProfile},
};
use breditor_collab_relay::{
    AtomicTransportProfile, Role, Room, SuggestionRole,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn bounded(path: &str, max: u64) -> Result<String> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("functional input budget".into());
    }
    Ok(value)
}
fn capture(args: &[String]) -> Result {
    let [_, config, frame, author, title, draft] = args else {
        return Err("capture PROFILE_JSON FRAME_JSON AUTHOR TITLE DRAFT_JSON".into());
    };
    let profile =
        SharedRichProfile::from_standard_configuration_json_v3(&bounded(config, 262_144)?)?;
    let source = profile.join_frame("room".into(), "900".into(), &bounded(frame, 6_291_456)?)?;
    let draft: DocumentSuggestionDraft = serde_json::from_str(&bounded(draft, 1_048_576)?)?;
    let packet = source.capture_document_suggestion_guarded(
        &source.observe()?,
        title,
        ReviewPrincipalId::try_new(author)?,
        "1792200000000",
        draft,
    )?;
    println!("{packet}");
    Ok(())
}
#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.first().is_some_and(|value| value == "capture") {
        return capture(&args);
    }
    let [log, configuration, document, auth, bind] = args.as_slice() else {
        return Err("expected LOG PROFILE_JSON DOCUMENT_JSON AUTH_JSON LOOPBACK_ADDRESS".into());
    };
    let address: SocketAddr = bind.parse()?;
    if !address.ip().is_loopback() {
        return Err("functional host requires loopback".into());
    }
    let room = if Path::new(log).exists() {
        Room::open(Path::new(log))?.0
    } else {
        let mut room = Room::create_atomic_transport_v2(
            Path::new(log),
            &bounded(configuration, 262_144)?,
            &bounded(document, 4_194_304)?,
            "functional-owner",
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        )?;
        room.enable_document_suggestions("functional-owner")?;
        room.enable_review("functional-owner")?;
        room.enable_document_versions("functional-owner")?;
        for principal in ["alice", "bob"] {
            room.grant("functional-owner", principal, Some(Role::Editor))?;
            room.grant_document_suggestions(
                "functional-owner",
                principal,
                Some(SuggestionRole::Review),
            )?;
        }
        for principal in ["carol", "dana"] {
            room.grant("functional-owner", principal, Some(Role::Reader))?;
        }
        room.grant_document_suggestions("functional-owner", "carol", Some(SuggestionRole::Review))?;
        room
    };
    room.document_suggestions_descriptor("functional-owner")?;
    let authentication = Authentication::from_json(&bounded(auth, 262_144)?)?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    axum::serve(listener, server::router(room, authentication))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
