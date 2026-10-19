//! Real loopback HTTP, host capture, complete stop, recovery and explicit fresh authentication.
use super::support::{Directory, Result, raster, source};
use breditor_collab_relay::{
    RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
    assets::asset_id,
    server::{Authentication, router_with_server_backups},
};
use image::ImageFormat;
use serde_json::json;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};
fn authentication() -> Result<(Authentication, String, String)> {
    let (owner, owner_hash) = Authentication::issue_token()?;
    let (reader, reader_hash) = Authentication::issue_token()?;
    let config=json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":owner_hash},{"principal":"reader","tokenHash":reader_hash}]}).to_string();
    Ok((Authentication::from_json(&config)?, owner, reader))
}
async fn request(
    address: SocketAddr,
    method: &str,
    path: &str,
    principal: &str,
    token: &str,
    bytes: &[u8],
) -> Result<(u16, Vec<u8>)> {
    let head = format!(
        "{method} {path} HTTP/1.1\r\nHost: {address}\r\nOrigin: http://127.0.0.1:4187\r\nX-Breditor-Principal: {principal}\r\nAuthorization: Bearer {token}\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    let bytes = bytes.to_vec();
    let response = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        let mut socket = TcpStream::connect_timeout(&address, Duration::from_secs(5))?;
        socket.set_read_timeout(Some(Duration::from_secs(5)))?;
        socket.set_write_timeout(Some(Duration::from_secs(5)))?;
        socket.write_all(head.as_bytes())?;
        socket.write_all(&bytes)?;
        let mut response = Vec::new();
        socket.read_to_end(&mut response)?;
        Ok(response)
    })
    .await??;
    let split =
        response.windows(4).position(|w| w == b"\r\n\r\n").ok_or("HTTP response headers")?;
    let status = std::str::from_utf8(&response[..split])?
        .split_whitespace()
        .nth(1)
        .ok_or("HTTP status")?
        .parse()?;
    Ok((status, response[split + 4..].to_vec()))
}
async fn start(
    router: axum::Router,
) -> Result<(
    SocketAddr,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<std::io::Result<()>>,
)> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await
    });
    Ok((address, stop, task))
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn actual_host_capture_retains_http_upload_and_restore_requires_fresh_authentication()
-> Result {
    let directory = Directory::new()?;
    let (_profile, room, assets) = source(&directory)?;
    let (auth, owner, reader) = authentication()?;
    let (router, handle) = router_with_server_backups(room, auth, assets)?;
    let (address, stop, task) = start(router).await?;
    let empty = handle.capture().await?;
    assert_eq!(empty.info().identity.assets.assets, 0);
    let empty_file = empty.to_bytes()?;
    let bytes = raster(ImageFormat::Png)?;
    let asset = asset_id(&bytes);
    let path = format!("/assets/{asset}");
    assert_eq!(request(address, "PUT", &path, "reader", &reader, &bytes).await?.0, 403);
    assert_eq!(request(address, "PUT", &path, "owner", &owner, &bytes).await?.0, 200);
    let (status, body) = request(address, "GET", &path, "reader", &reader, &[]).await?;
    assert_eq!(status, 200);
    assert_eq!(body, bytes);
    let backup = handle.capture().await?;
    assert_eq!(backup.info().identity.assets.assets, 1);
    assert_eq!(empty.to_bytes()?, empty_file);
    assert_eq!(
        request(address, "GET", "/backup", "owner", &owner, &[]).await?.0,
        404,
        "No account-facing backup route is installed"
    );
    stop.send(()).map_err(|()| "stop source server")?;
    task.await??;
    drop(handle);
    let expected = backup.info().identity;
    let backup = ServerRoomBackup::from_bytes(&backup.to_bytes()?)?;
    let restored = ServerRoomRecovery::begin(
        &directory.0.join("restored"),
        &backup,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    let (room, assets) = restored.into_parts();
    let (current_auth, current_owner, current_reader) = authentication()?;
    let (router, handle) = router_with_server_backups(room, current_auth, assets)?;
    let (address, stop, task) = start(router).await?;
    assert_eq!(request(address, "GET", &path, "reader", &reader, &[]).await?.0, 403);
    let (status, body) = request(address, "GET", &path, "reader", &current_reader, &[]).await?;
    assert_eq!(status, 200);
    assert_eq!(body, bytes);
    assert_eq!(request(address, "PUT", &path, "owner", &current_owner, &bytes).await?.0, 200);
    assert_eq!(handle.capture().await?.info().identity, expected);
    stop.send(()).map_err(|()| "stop recovered server")?;
    task.await??;
    drop(handle);
    Ok(())
}
