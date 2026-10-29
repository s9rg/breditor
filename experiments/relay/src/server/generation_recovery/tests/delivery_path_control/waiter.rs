//! Reproduce cancellation of the ACTUAL admitted handler while actual native provider work remains blocked.
use super::super::source::{POLICY, TestResult};
use super::{
    fixture::{Gate, ORIGIN, Setup},
    network::{Network, Request},
};
use crate::OperationalLogGenerationServerRoom;
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn abandoned_waiter_cannot_release_a_shared_slot_while_actual_native_work_is_still_running()
-> TestResult {
    let mut premature = Vec::new();
    for kind in 0..3 {
        let mut setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
        let server = Network::start(setup.router.clone()).await?;
        let selected = setup.selection();
        let body = match kind {
            0 => serde_json::to_vec(&selected)?,
            1 => serde_json::to_vec(&selected.current)?,
            _ => serde_json::to_vec(&selected.current.current)?,
        };
        let request = axum::http::Request::builder()
            .method("POST")
            .uri("/")
            .header("Origin", ORIGIN)
            .header("X-Breditor-Principal", "operator")
            .header("Authorization", format!("Bearer {}", setup.token))
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(body))?;
        let (gate, entered) = Gate::new();
        let _release = gate.release_on_drop();
        *setup.provider.gate.lock().map_err(|_| "actual provider gate")? = Some(gate.clone());
        let actual = crate::server::generation_recovery::delivery_path_control::request_for_test(
            setup.control.as_ref().ok_or("control")?,
            request,
            kind,
        );
        let waiter = tokio::spawn(actual);
        entered.await?;
        waiter.abort();
        assert!(waiter.await.expect_err("waiter was aborted").is_cancelled());
        // The second slot is witnessed by a real HTTP100-continue. A third
        // header must receive503,not100,without needing the locked native room.
        let second = server.unfinished(&setup.token).await?;
        let status = server.admission_status(&Request::check(&setup.token)).await?;
        if status != 503 {
            premature.push((kind, status));
        }
        gate.release();
        assert_eq!(Network::finish_unfinished(second).await?.status, 400);
        server.stop().await?;
        setup.host.take();
        setup.control.take();
        // Do not destroy the original while its actual detached native worker
        // is draining. Reacquisition is a real native custody witness,not sleep.
        let directory = setup.source.directory.0.join("delivery-path-control");
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                if let Ok(held) = OperationalLogGenerationServerRoom::resume(
                    &directory,
                    &setup.source.original,
                    &setup.source.original.info()?.identity,
                    POLICY,
                    "owner",
                ) {
                    drop(held);
                    break Ok::<_, crate::Error>(());
                }
                tokio::task::yield_now().await;
            }
        })
        .await??;
    }
    assert!(
        premature.is_empty(),
        "Actual blocked work lost its shared slot after only the waiter ended: {premature:?}"
    );
    Ok(())
}
