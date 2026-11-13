//! Existing authenticated sockets and offline Undo keep working through live continuation.
use super::{Fixture, TestResult, publication_observation_for_test};
use crate::{
    Error, ServerNativeHistoryBoundary as Boundary, ServerNativeHistoryFamily as Family,
    ServerNativeHistoryLane as Lane,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_maintains_histories_while_original_clients_keep_their_live_leases()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    let native = &fixture.native;
    let document = Boundary::ContinueDocument { next: "serving-document-two".into() };
    assert!(matches!(
        native
            .apply_native_history_boundary(
                "owner",
                &fixture.setup.owner,
                Lane::Document,
                document.clone()
            )
            .await,
        Err(Error::NeedsRecovery)
    ));
    fixture.commit().await?;
    let published = fixture.publish().await?;
    let active = fixture.resumed().await?;
    assert!(matches!(
        native
            .apply_native_history_boundary(
                "owner",
                &fixture.setup.reader,
                Lane::Document,
                document.clone()
            )
            .await,
        Err(Error::Permission)
    ));
    let receipt = native
        .apply_native_history_boundary(
            "owner",
            &fixture.setup.owner,
            Lane::Document,
            document.clone(),
        )
        .await?;
    assert_eq!(receipt.format_version, 2);
    let review = native
        .apply_native_history_boundary(
            "owner",
            &fixture.setup.owner,
            Lane::Review,
            Boundary::ContinueReview { next: "serving-review-two".into() },
        )
        .await?;
    assert!(receipt.sequence.parse::<u64>()? < review.sequence.parse::<u64>()?);
    let retry = native
        .apply_native_history_boundary("owner", &fixture.setup.owner, Lane::Document, document)
        .await?;
    assert_eq!(retry, crate::ServerNativeHistoryReceipt { duplicate: true, ..receipt });
    let descriptor = fixture
        .setup
        .handle
        .host
        .transaction(|room| room.native_history_descriptor("owner"))
        .await?;
    assert_eq!(descriptor.document, Family::ContinuedV2);
    assert_eq!(descriptor.review, Some(Family::ContinuedV2));
    let socket = super::super::publication_history::continue_original_history(
        active.socket,
        &fixture.setup.source,
    )
    .await?;
    assert_eq!(fixture.publish().await?, published);
    assert_eq!(publication_observation_for_test(&fixture.publication).2, 1);
    fixture.publication.close().await?;
    drop(socket);
    fixture.network.stop().await?;
    Ok(())
}
