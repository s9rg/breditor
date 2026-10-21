//! Origin, separate operator auth, exact control pins and bounded request/native capacity precede reads.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::server::prepare_physical_room_recovery_control;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn operator_tokens_cannot_reuse_native_accounts_or_bypass_current_owner_auth() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let before = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    assert!(
        prepare_physical_room_recovery_control(
            setup.fixture.host().clone(),
            setup.proof.clone(),
            setup.provider.clone(),
            "owner",
            &setup.fixture.owner,
            operators(&setup.fixture.owner)?
        )
        .await
        .is_err()
    );
    assert!(
        prepare_physical_room_recovery_control(
            setup.fixture.host().clone(),
            setup.proof.clone(),
            setup.provider.clone(),
            "owner",
            &setup.fixture.reader,
            operators(&setup.token)?
        )
        .await
        .is_err()
    );
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, before);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn exact_origin_operator_account_closed_selection_and_body_limits_are_enforced_over_http()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let selection = setup.selection();
    let body = serde_json::to_vec(&selection)?;
    let before = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for wrong in ["origin", "native-token", "principal", "token"] {
        let mut request = Request::check(&setup.token);
        match wrong {
            "origin" => request.origin = "http://localhost:4187",
            "native-token" => {
                request.principal = "owner";
                request.token = &setup.fixture.owner;
            }
            "principal" => request.principal = "owner",
            _ => request.token = &setup.fixture.reader,
        }
        assert_eq!(server.request(&request, b"invalid private request").await?.status, 403);
    }
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, before);
    let mut wrong = selection.clone();
    wrong.instance = "0".repeat(64);
    assert_eq!(
        server.request(&Request::check(&setup.token), &serde_json::to_vec(&wrong)?).await?.status,
        400
    );
    let mut unknown = serde_json::to_value(&selection)?;
    unknown["verified"] = serde_json::json!(true);
    assert_eq!(
        server.request(&Request::check(&setup.token), &serde_json::to_vec(&unknown)?).await?.status,
        400
    );
    assert_eq!(
        server.request(&Request::check(&setup.token), &vec![b' '; 64 * 1024 + 1]).await?.status,
        413
    );
    let mut request = Request::check(&setup.token);
    request.method = "OPTIONS";
    request.extra = "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: Authorization, Content-Type, X-Breditor-Principal\r\n";
    assert_eq!(server.request(&request, &[]).await?.status, 204);
    request.extra =
        "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: X-Other\r\n";
    assert_eq!(server.request(&request, &[]).await?.status, 403);
    assert_eq!(server.request(&Request::check(&setup.token), &body).await?.status, 200);
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn two_authenticated_incomplete_requests_bound_native_operator_work_without_a_waiting_queue()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let first = server.unfinished(&setup.token).await?;
    let second = server.unfinished(&setup.token).await?;
    let body = serde_json::to_vec(&setup.selection())?;
    let mut saturated = false;
    for _ in 0..16 {
        let status = server.request(&Request::check(&setup.token), &body).await?.status;
        if status == 503 {
            saturated = true;
            break;
        }
        assert_eq!(status, 200);
        tokio::task::yield_now().await;
    }
    assert!(saturated, "Two admitted bodies occupy the bounded operator request permits");
    drop(first);
    drop(second);
    // Draining an empty body refuses; retry is safe and cannot publish unrelated work.
    let mut restored = false;
    for _ in 0..16 {
        let status = server.request(&Request::check(&setup.token), &body).await?.status;
        if status == 200 {
            restored = true;
            break;
        }
        assert_eq!(status, 503);
        tokio::task::yield_now().await;
    }
    assert!(restored);
    server.stop().await?;
    Ok(())
}
