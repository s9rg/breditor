//! The catalog slot covers queued native work and outstanding response bytes.
use super::*;
use crate::{DocumentVersionAdmission, room::segment_handover_test_source, server::Authentication};
use axum::{
    extract::{Path, State},
    http::Request,
};
use breditor_collab_feasibility::review::ReviewPrincipalId;
use serde_json::json;

#[tokio::test]
async fn version_packet_keeps_capacity_until_the_response_payload_is_released()
-> std::result::Result<(), Box<dyn std::error::Error>> {
    const ORIGIN: &str = "http://127.0.0.1:4187";
    let (_files, mut room, profile) = segment_handover_test_source(3, true, true)?;
    let descriptor = room.enable_document_versions("owner")?;
    let writer = room.register("owner")?;
    let author = profile.join_frame("room".into(), writer.lease.writer, &room.catchup("owner")?)?;
    let packet = author.capture_document_version_guarded(
        &author.observe()?,
        "Released 日本 🙂",
        ReviewPrincipalId::try_new("owner")?,
        "1792200000000",
    )?;
    let DocumentVersionAdmission::Durable(accepted) =
        room.publish_document_version("owner", &packet)?
    else {
        return Err("Expected an accepted version".into());
    };
    let id = accepted.entry.version.id;
    let (token, hash) = Authentication::issue_token()?;
    let auth = Authentication::from_json(
        &json!({
            "format":"breditor/relay-auth", "formatVersion":1, "origins":[ORIGIN],
            "accounts":[{"principal":"owner", "tokenHash":hash}],
        })
        .to_string(),
    )?;
    let host = super::super::create_host(room, auth, None);
    let request = |body: Body| {
        Request::builder()
            .header("origin", ORIGIN)
            .header("x-breditor-principal", "owner")
            .header("authorization", format!("Bearer {token}"))
            .header("x-breditor-catalog", &descriptor.binding)
            .header("content-type", "application/json")
            .body(body)
    };
    let headers = request(Body::empty())?.headers().clone();
    let occupied = host.version_operations.clone().try_acquire_many_owned(3)?;
    let response = download(State(host.clone()), Path(id.clone()), headers.clone()).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-breditor-catalog"], descriptor.binding);
    let payload = to_bytes(response.into_body(), packet.len()).await?;
    assert_eq!(payload.as_ref(), packet.as_bytes());
    assert_eq!(host.version_operations.available_permits(), 0);
    let mut unauthenticated = headers.clone();
    unauthenticated.remove("authorization");
    assert_eq!(
        describe(State(host.clone()), unauthenticated).await.status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        describe(State(host.clone()), headers.clone()).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        list(State(host.clone()), request(Body::from(r#"{"cursor":null}"#))?).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        publish(State(host.clone()), request(Body::from(packet.clone()))?).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        download(State(host.clone()), Path(id), headers).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    drop(payload);
    let response = list(State(host.clone()), request(Body::from(r#"{"cursor":null}"#))?).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(host.version_operations.available_permits(), 0);
    drop(response);
    assert_eq!(host.version_operations.available_permits(), 1);
    let response = publish(State(host.clone()), request(Body::from(packet))?).await;
    assert_eq!(response.status(), StatusCode::OK);
    let result: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 8192).await?)?;
    assert_eq!(result["descriptor"]["binding"], descriptor.binding);
    assert_eq!(result["admission"]["duplicate"], true);
    assert_eq!(host.version_operations.available_permits(), 1);
    drop(occupied);
    Ok(())
}
