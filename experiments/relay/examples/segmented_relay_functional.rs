//! Isolated generation-client acceptance host with an explicit original/V2 wire selection.
//! Existing logs and public server defaults are never upgraded by this fixture.
use breditor_collab_relay::{
    AtomicTransportProfile, ReviewRole, Role, Room,
    server::{self, Authentication},
};
use serde_json::json;
use std::{fs::File, io::Read, net::SocketAddr, path::Path};

fn bounded(path: &str, max: u64) -> Result<String, Box<dyn std::error::Error>> {
    let mut value = String::new();
    File::open(path)?.take(max + 1).read_to_string(&mut value)?;
    if u64::try_from(value.len())? > max {
        return Err("functional input budget".into());
    }
    Ok(value)
}

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [log, configuration, document, auth, bind, selected] = args.as_slice() else {
        return Err(
            "expected LOG PROFILE DOCUMENT AUTH LOOPBACK_ADDRESS original-v1|atomic-v2".into()
        );
    };
    let transport = match selected.as_str() {
        "original-v1" => 1,
        "atomic-v2" => 2,
        _ => return Err("select the exact writer transport".into()),
    };
    let address: SocketAddr = bind.parse()?;
    if !address.ip().is_loopback() {
        return Err("functional host requires loopback".into());
    }
    let room = if Path::new(log).exists() {
        Room::open(Path::new(log))?.0
    } else {
        let configuration = bounded(configuration, 256 * 1024)?;
        let document = bounded(document, 4 * 1024 * 1024)?;
        let mut room = if transport == 2 {
            Room::create_atomic_transport_v2(
                Path::new(log),
                &configuration,
                &document,
                "functional-owner",
                AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
            )?
        } else {
            Room::create_standard_layout_v3(
                Path::new(log),
                &configuration,
                &document,
                "functional-owner",
            )?
        };
        room.enable_review("functional-owner")?;
        room.enable_document_versions("functional-owner")?;
        for principal in ["alice", "bob"] {
            room.grant("functional-owner", principal, Some(Role::Editor))?;
            room.grant_review("functional-owner", principal, Some(ReviewRole::Comment))?;
        }
        room
    };
    if room.writer_transport_version() != transport {
        return Err("retained room transport differs from the explicit fixture selection".into());
    }
    room.review_descriptor("functional-owner")?;
    let authentication = Authentication::from_json(&bounded(auth, 256 * 1024)?)?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("{}", json!({"kind":"listening","address":listener.local_addr()?.to_string()}));
    axum::serve(listener, server::router(room, authentication))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
