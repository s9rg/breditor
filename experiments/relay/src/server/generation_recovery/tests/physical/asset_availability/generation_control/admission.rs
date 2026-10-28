//! Origin, separate operator auth, exact control pins and bounded request/native capacity precede reads.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::server::prepare_log_generation_recovery_control;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn operator_tokens_cannot_reuse_native_accounts_or_bypass_current_owner_auth() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let before = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    assert!(
        prepare_log_generation_recovery_control(
            setup.fixture.local().clone(),
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
        prepare_log_generation_recovery_control(
            setup.fixture.local().clone(),
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
    assert_eq!(
        server.request(&Request::check(&setup.token), &body).await?.status,
        503,
        "Two actual Continue handshakes precede the quota assertion"
    );
    // Complete each real request with malformed JSON and observe its final refusal.
    // Its permit has then retired, rather than guessing when a dropped socket is serviced.
    assert_eq!(Network::finish_unfinished(first).await?.status, 400);
    assert_eq!(Network::finish_unfinished(second).await?.status, 400);
    assert_eq!(server.request(&Request::check(&setup.token), &body).await?.status, 200);
    server.stop().await?;
    Ok(())
}
