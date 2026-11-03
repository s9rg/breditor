//! Original offline journals and future Undo/Redo through the published socket.
use super::{
    native_activation::Setup,
    publication_socket::Socket,
    source::{TestResult, review_policy},
};
use breditor_collab_feasibility::{review::ReviewOutcome, rich_replica::RichReplica};
use serde_json::{Value, json};

async fn document_groups(
    mut socket: Socket,
    document: &RichReplica,
    after: &str,
) -> TestResult<(Socket, String)> {
    let groups: Value =
        serde_json::from_str(&document.writer_groups_v2_guarded(&document.observe()?, after)?)?;
    let frames = groups["groups"].as_array().ok_or("original document groups")?;
    assert!(!frames.is_empty());
    for group in frames {
        let (next, receipt) =
            socket.request("submit", json!({"kind":"submit","group":group})).await?;
        assert_eq!(receipt["kind"], "durable");
        assert_eq!(receipt["duplicate"], false);
        socket = next;
    }
    Ok((socket, groups["through"].as_str().ok_or("document through")?.into()))
}

pub(super) async fn continue_original_history(
    mut socket: Socket,
    setup: &Setup,
) -> TestResult<Socket> {
    let mut document = setup.source.profile.restore("room", &setup.source.offline)?;
    let mut comments = document
        .restore_review_session(review_policy("owner.comments")?, &setup.source.review_offline)?;
    let (next, through) = document_groups(socket, &document, &setup.source.through).await?;
    socket = next;
    let mut document_through = through;
    let frame = comments.export_frame(setup.source.review_through)?;
    let (next, response) =
        socket.request("comments-submit", json!({"kind":"reviewSubmit","frame":frame})).await?;
    assert_eq!(response["kind"], "reviewAdmission");
    assert_eq!(response["admission"]["kind"], "durable");
    let (next, repeated) =
        next.request("comments-repeat", json!({"kind":"reviewSubmit","frame":frame})).await?;
    assert_eq!(repeated["admission"]["kind"], "durable");
    assert_eq!(repeated["admission"]["duplicate"], true);
    socket = next;
    let mut comment_through: u64 = comments.local_writer_clock()?.through.parse()?;
    let original_comment_depth = comments.view()?.undo_depth;
    assert!(original_comment_depth > 0);
    for redo in [false, true] {
        assert!(if redo { document.redo()? } else { document.undo()? });
        let (next, through) = document_groups(socket, &document, &document_through).await?;
        document_through = through;
        let (next, current) = next.request("actual-document", json!({"kind":"sync"})).await?;
        assert_eq!(current["kind"], "catchup");
        document.receive_frame(current["frame"].as_str().ok_or("actual document frame")?)?;
        assert!(document.document_json().contains("Accepted "));
        assert_eq!(document.document_json().contains("Old offline "), redo);
        let observation = comments.observe();
        let outcome = if redo {
            document.redo_review_guarded(&document.observe()?, &mut comments, &observation)?
        } else {
            document.undo_review_guarded(&document.observe()?, &mut comments, &observation)?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        let frame = comments.export_frame(comment_through)?;
        let (next, actual) =
            next.request("actual-comments", json!({"kind":"reviewSubmit","frame":frame})).await?;
        assert_eq!(actual["admission"]["kind"], "durable");
        assert_eq!(actual["admission"]["duplicate"], false);
        comment_through = comments.local_writer_clock()?.through.parse()?;
        let (next, actual_clock) = next
            .request(
                "actual-comment-clock",
                json!({"kind":"reviewClock","actor":setup.source.reviewer.lease.actor}),
            )
            .await?;
        assert_eq!(actual_clock["kind"], "reviewClock");
        assert_eq!(actual_clock["clock"]["through"], comment_through.to_string());
        let restored = document.restore_review_session(
            review_policy("owner.comments")?,
            &comments.checkpoint_json()?,
        )?;
        assert_eq!(restored.view()?, comments.view()?);
        let expected = if redo { original_comment_depth } else { original_comment_depth - 1 };
        assert_eq!(restored.view()?.undo_depth, expected);
        socket = next;
    }
    Ok(socket)
}
