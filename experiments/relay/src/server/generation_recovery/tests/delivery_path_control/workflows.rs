//! Actual independently selected A/B/C and current-provider control across forty native modes.
use super::super::source::TestResult;
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use std::sync::atomic::Ordering;
async fn workflow(profile: (u32, bool), atomic: bool, document: bool, review: bool) -> TestResult {
    let setup = Box::pin(Setup::new(profile, atomic, document, review)).await?;
    let selected = setup.selection();
    assert_eq!(selected.path.current, selected.current.continuation.current);
    assert_eq!(selected.path.current, selected.current.current.source);
    assert_eq!(selected.path.ancestors.len(), 2);
    assert_eq!(selected.path.ancestors[0], selected.current.continuation.previous);
    assert_ne!(selected.path.ancestors[1], selected.current.continuation.previous);
    assert_ne!(selected.path.ancestors[0], selected.path.current.origin);
    assert_ne!(selected.path.ancestors[1], selected.path.current.server);
    let server = Network::start(setup.router.clone()).await?;
    let body = serde_json::to_vec(&selected)?;
    let response = server.request(&Request::check(&setup.token), &body).await?;
    assert_eq!(response.status, 200);
    assert!(
        response
            .headers
            .to_ascii_lowercase()
            .contains("access-control-allow-origin: http://127.0.0.1:4187")
    );
    let read: serde_json::Value = serde_json::from_slice(&response.body)?;
    assert_eq!(read["selection"], serde_json::to_value(&selected)?);
    assert_eq!(read["scope"], "complete-ordered-native-server-path-and-current-provider");
    let mut current = Request::check(&setup.token);
    current.path = "/recovery/generations/v1/check";
    assert_eq!(
        server.request(&current, &serde_json::to_vec(&selected.current.current)?).await?.status,
        200
    );
    assert_eq!(server.request(&current, &body).await?.status, 400);
    let mut prior = Request::check(&setup.token);
    prior.path = "/recovery/generation-delivery/v1/check";
    assert_eq!(server.request(&prior, &serde_json::to_vec(&selected.current)?).await?.status, 200);
    assert_eq!(server.request(&prior, &body).await?.status, 400);
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&selected.current.current)?)
            .await?
            .status,
        400
    );
    assert!(setup.provider.calls.load(Ordering::Acquire) > 0);
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_modes_keep_complete_ordered_path_and_literal_inner_controls_without_mutation()
-> TestResult {
    let mut count = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    Box::pin(workflow(profile, atomic, document, review)).await?;
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 40);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn authentication_previous_current_pins_body_bounds_and_preflight_precede_native_provider_work()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let selected = setup.selection();
    let calls = setup.provider.calls.load(Ordering::Acquire);
    for kind in ["origin", "native-token", "principal", "token"] {
        let mut request = Request::check(&setup.token);
        match kind {
            "origin" => request.origin = "http://localhost:4187",
            "native-token" => {
                request.principal = "owner";
                request.token = &setup.owner;
            }
            "principal" => request.principal = "owner",
            _ => request.token = &setup.reader,
        }
        assert_eq!(server.request(&request, b"PRIVATE").await?.status, 403);
    }
    assert_eq!(setup.provider.calls.load(Ordering::Acquire), calls);
    for field in
        ["instance", "previous", "current", "reordered", "omitted", "path-current", "extra"]
    {
        let mut wrong = serde_json::to_value(&selected)?;
        match field {
            "instance" => wrong["instance"] = serde_json::json!("0".repeat(64)),
            "previous" => {
                wrong["path"]["ancestors"][0]["archiveSha256"][0] =
                    serde_json::json!(selected.path.ancestors[0].archive_sha256[0] ^ 1);
            }
            "current" => wrong["current"]["instance"] = serde_json::json!("0".repeat(64)),
            "reordered" => wrong["path"]["ancestors"].as_array_mut().ok_or("path array")?.reverse(),
            "omitted" => {
                wrong["path"]["ancestors"].as_array_mut().ok_or("path array")?.remove(0);
            }
            "path-current" => {
                wrong["path"]["current"]["server"]["archiveSha256"][0] = serde_json::json!(0);
            }
            _ => wrong["verified"] = serde_json::json!(true),
        }
        assert_eq!(
            server
                .request(&Request::check(&setup.token), &serde_json::to_vec(&wrong)?)
                .await?
                .status,
            400
        );
    }
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &vec![b' '; 16 * 1024 * 1024 + 1])
            .await?
            .status,
        413
    );
    for (path, limit) in [
        ("/recovery/generations/v1/check", 64 * 1024),
        ("/recovery/generation-delivery/v1/check", 256 * 1024),
    ] {
        let mut old = Request::check(&setup.token);
        old.path = path;
        assert_eq!(server.request(&old, &vec![b' '; limit + 1]).await?.status, 413);
    }
    let mut request = Request::check(&setup.token);
    request.method = "OPTIONS";
    request.extra = "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: Authorization, Content-Type, X-Breditor-Principal\r\n";
    assert_eq!(server.request(&request, &[]).await?.status, 204);
    request.extra =
        "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: X-Other\r\n";
    assert_eq!(server.request(&request, &[]).await?.status, 403);
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&selected)?)
            .await?
            .status,
        200
    );
    server.stop().await?;
    Ok(())
}
