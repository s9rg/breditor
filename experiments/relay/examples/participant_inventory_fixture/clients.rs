//! Original native document/review histories and protected, nonserializable registration inputs.
use super::{Result, source::Spec};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::InsertText,
    },
};
use breditor_collab_relay::{
    Admission, RecoveryDocumentCredential, RecoveryRegistrationCredentials,
    RecoveryReviewCredential, Registration, ReviewRegistration, ReviewRole, Room,
};
use serde_json::{Value, json};

pub struct CapturedClients {
    pub records: Value,
    pub protected: RecoveryRegistrationCredentials,
    pub secrets: Vec<String>,
}
fn fork_document(profile: &SharedRichProfile, base: &str) -> Result<String> {
    let mut alternate = profile.restore("room", base)?;
    alternate.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "F".repeat("Accepted native prefix ".len()),
    })])?;
    Ok(alternate.checkpoint()?)
}
fn fork_metadata(client: &RichReplica, comment: &ReviewRegistration) -> Result<String> {
    let mut alternate = client.create_review_session(ReviewActorPolicy {
        actor: comment.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let anchor =
        client.capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?;
    let observed = alternate.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut alternate,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Different native first comment".into(),
        }),
    )?;
    Ok(alternate.checkpoint_json()?)
}
fn author(
    room: &mut Room,
    profile: &SharedRichProfile,
    registered: &Registration,
    comment: &ReviewRegistration,
    spec: Spec,
) -> Result<Value> {
    let mut client = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    let base = client.checkpoint()?;
    let fork = fork_document(profile, &base)?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Accepted native prefix ".into(),
    })])?;
    let groups: Value = serde_json::from_str(&if spec.atomic {
        client.writer_groups_v2_guarded(&client.observe()?, "0")?
    } else {
        client.writer_groups_guarded(&client.observe()?, "0")?
    })?;
    for group in groups["groups"].as_array().ok_or("groups")? {
        if !matches!(
            room.admit("alice", &registered.lease, group.as_str().ok_or("group")?)?,
            Admission::Durable(_)
        ) {
            return Err("fixture document not durable".into());
        }
    }
    let mut review = client.create_review_session(ReviewActorPolicy {
        actor: comment.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let empty_review = review.checkpoint_json()?;
    let anchor =
        client.capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?;
    let observed = review.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut review,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Accepted native comment".into(),
        }),
    )?;
    room.admit_review("alice", &comment.lease, &review.export_frame(0)?)?;
    let fork_review = fork_metadata(&client, comment)?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Native offline retained ".into(),
    })])?;
    let anchor =
        client.capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?;
    let observed = review.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut review,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Native offline comment retained".into(),
        }),
    )?;
    Ok(
        json!({"principal":"alice","writer":registered.lease.writer,"actor":comment.lease.actor.as_str(),"observer":false,"baseCheckpoint":base,"emptyReviewCheckpoint":empty_review,"forkCheckpoint":fork,"forkReviewCheckpoint":fork_review,"documentCheckpoint":client.checkpoint()?,"reviewCheckpoint":review.checkpoint_json()?}),
    )
}
fn observer(
    room: &Room,
    profile: &SharedRichProfile,
    registered: &Registration,
    comment: &ReviewRegistration,
) -> Result<Value> {
    let reader = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("reader")?,
    )?;
    let review = reader.create_review_session(ReviewActorPolicy {
        actor: comment.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("reader")?,
        access: ReviewAccess::ReadOnly,
    })?;
    Ok(
        json!({"principal":"reader","writer":registered.lease.writer,"actor":comment.lease.actor.as_str(),"observer":true,"documentCheckpoint":reader.checkpoint()?,"reviewCheckpoint":review.checkpoint_json()?}),
    )
}
pub fn capture(
    room: &mut Room,
    profile: &SharedRichProfile,
    spec: Spec,
) -> Result<CapturedClients> {
    room.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
    let registered = room.register("alice")?;
    let reader = room.register_observer("reader")?;
    let comment = room.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
    let readonly =
        room.register_review_observer("reader", ReviewActorId::try_new("reader.comments")?)?;
    let records = json!([
        author(room, profile, &registered, &comment, spec)?,
        observer(room, profile, &reader, &readonly)?
    ]);
    let protected = RecoveryRegistrationCredentials {
        documents: [&registered, &reader]
            .into_iter()
            .zip(["alice", "reader"])
            .map(|(r, p)| RecoveryDocumentCredential {
                principal: p.into(),
                writer: r.lease.writer.clone(),
                credential: r.credential.clone(),
            })
            .collect(),
        reviews: [&comment, &readonly]
            .into_iter()
            .zip(["alice", "reader"])
            .map(|(r, p)| RecoveryReviewCredential {
                principal: p.into(),
                actor: r.lease.actor.as_str().into(),
                credential: r.credential.clone(),
            })
            .collect(),
    };
    let secrets = vec![
        registered.credential,
        reader.credential,
        comment.credential,
        readonly.credential,
        registered.lease.token,
        reader.lease.token,
        comment.lease.token,
        readonly.lease.token,
    ];
    Ok(CapturedClients { records, protected, secrets })
}
