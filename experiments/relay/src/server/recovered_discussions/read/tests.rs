use super::*;
use crate::{
    Error,
    room::{SegmentHandoverTestFiles, segment_handover_test_source},
    server::Authentication,
};
use axum::{body::to_bytes, http::Request};
use serde_json::json;
use std::time::Duration;
use tokio::sync::oneshot;

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const ORIGIN: &str = "http://127.0.0.1:4187";
const DEADLINE: Duration = Duration::from_secs(10);

fn fixture() -> TestResult<(Host, HeaderMap, SegmentHandoverTestFiles)> {
    let (files, mut room, _) = segment_handover_test_source(3, true, true)?;
    let binding = room.enable_review("owner")?.binding;
    let (token, hash) = Authentication::issue_token()?;
    let auth = Authentication::from_json(
        &json!({
            "format":"breditor/relay-auth", "formatVersion":1, "origins":[ORIGIN],
            "accounts":[{"principal":"owner", "tokenHash":hash}]
        })
        .to_string(),
    )?;
    let headers = Request::builder()
        .header("origin", ORIGIN)
        .header("authorization", format!("Bearer {token}"))
        .header("x-breditor-principal", "owner")
        .header("x-breditor-review", binding)
        .body(())?
        .into_parts()
        .0
        .headers;
    Ok((super::super::super::create_host(room, auth, None), headers, files))
}

fn id() -> (String, String) {
    ("1".into(), "1".into())
}

#[tokio::test]
async fn successful_read_keeps_capacity_with_its_body_and_leaves_publication_available()
-> TestResult {
    let (host, headers, _files) = fixture()?;
    let quota = host.discussion_operations.clone();
    let _other = quota.clone().try_acquire_owned()?;
    let bytes = "accepted 日本".as_bytes();
    let response =
        read(host.clone(), id(), headers.clone(), CONTENT_TYPE, |_, _| Ok(Some(bytes.to_vec())))
            .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], CONTENT_TYPE);
    let payload = to_bytes(response.into_body(), bytes.len()).await?;
    assert_eq!(payload.as_ref(), bytes);
    assert_eq!(quota.available_permits(), 0);
    assert_eq!(
        discover(State(host.clone()), Path(id()), headers.clone()).await.status(),
        StatusCode::SERVICE_UNAVAILABLE,
    );
    let _publication = host.discussion_publications.clone().try_acquire_owned()?;
    drop(payload);
    assert_eq!(download(State(host), Path(id()), headers).await.status(), StatusCode::NOT_FOUND,);
    assert_eq!(quota.available_permits(), 1);
    Ok(())
}

#[tokio::test]
async fn cancelled_read_keeps_capacity_until_native_work_finishes() -> TestResult {
    let (host, headers, _files) = fixture()?;
    let quota = host.discussion_operations.clone();
    let _other = quota.clone().try_acquire_owned()?;
    let (started, waiting) = oneshot::channel();
    let (release, parked) = std::sync::mpsc::channel();
    let worker = tokio::spawn(read(host, id(), headers, CONTENT_TYPE, move |_, _| {
        started.send(()).map_err(|()| Error::NeedsRecovery)?;
        parked.recv_timeout(DEADLINE).map_err(|_| Error::NeedsRecovery)?;
        Ok(Some(vec![1]))
    }));

    tokio::time::timeout(DEADLINE, waiting).await??;
    worker.abort();
    assert!(worker.await.is_err_and(|error| error.is_cancelled()));
    assert_eq!(quota.available_permits(), 0);
    release.send(())?;
    let _available = tokio::time::timeout(DEADLINE, quota.acquire_owned()).await??;
    Ok(())
}
