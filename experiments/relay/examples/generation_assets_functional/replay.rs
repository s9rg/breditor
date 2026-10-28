//! Exact retained document/comment suffixes and future native Undo/Redo after real cold reopen.
use super::Result;
use breditor_collab_feasibility::{
    review::{ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId},
    rich_replica::{RichReplica, SharedRichProfile},
};
use breditor_collab_relay::{
    Admission, Lease, OperationalLogGenerationServerRoom, RecoveryRegistrationCredentials,
    ReviewAdmission, Room, RoomParticipantInventoryMetadata,
};
use serde_json::Value;
pub struct Saved {
    document: String,
    review: String,
    writer: String,
    credential: String,
    actor: ReviewActorId,
    review_credential: String,
    through: String,
    review_through: u64,
}
impl Saved {
    pub fn capture(
        records: &Value,
        protected: &RecoveryRegistrationCredentials,
        metadata: &RoomParticipantInventoryMetadata,
    ) -> Result<Self> {
        let author = records
            .as_array()
            .ok_or("client array")?
            .iter()
            .find(|r| r["principal"] == "alice")
            .ok_or("actual author")?;
        let writer = author["writer"].as_str().ok_or("writer")?.to_owned();
        let actor = ReviewActorId::try_new(author["actor"].as_str().ok_or("actor")?)?;
        let credential = protected
            .documents
            .iter()
            .find(|r| r.principal == "alice" && r.writer == writer)
            .ok_or("separate document credential")?
            .credential
            .clone();
        let review_credential = protected
            .reviews
            .iter()
            .find(|r| r.principal == "alice" && r.actor == actor.as_str())
            .ok_or("separate comment credential")?
            .credential
            .clone();
        let through = metadata
            .writers
            .iter()
            .find(|r| r.clock.writer == writer)
            .ok_or("accepted author clock")?
            .clock
            .through
            .clone();
        let review_through = metadata
            .review
            .as_ref()
            .ok_or("review metadata")?
            .writers
            .iter()
            .find(|r| r.clock.actor.as_str() == actor.as_str())
            .ok_or("accepted comment clock")?
            .clock
            .through
            .parse()?;
        Ok(Self {
            document: author["documentCheckpoint"].as_str().ok_or("retained document")?.into(),
            review: author["reviewCheckpoint"].as_str().ok_or("retained comments")?.into(),
            writer,
            credential,
            actor,
            review_credential,
            through,
            review_through,
        })
    }
    pub fn replay(
        &self,
        operation: &mut OperationalLogGenerationServerRoom,
        profile: &SharedRichProfile,
    ) -> Result {
        let (room, _) = operation.components_mut();
        let mut author = profile.restore("room", &self.document)?;
        author.receive_frame(&room.catchup("alice")?)?;
        let lease = room.resume("alice", &self.writer, &self.credential)?;
        let mut through = deliver(room, &author, &lease, &self.through)?;
        let expected = author.document_json().to_owned();
        assert!(author.undo()?);
        through = deliver(room, &author, &lease, &through)?;
        assert!(author.redo()?);
        deliver(room, &author, &lease, &through)?;
        assert_eq!(author.document_json(), expected);
        let policy = ReviewActorPolicy {
            actor: self.actor.clone(),
            principal: ReviewPrincipalId::try_new("alice")?,
            access: ReviewAccess::Comment,
        };
        let mut review = author.restore_review_session(policy, &self.review)?;
        let lease = room.resume_review("alice", &self.actor, &self.review_credential)?;
        let frame = review.export_frame(self.review_through)?;
        assert!(matches!(room.admit_review("alice", &lease, &frame)?, ReviewAdmission::Durable(_)));
        let ReviewAdmission::Durable(duplicate) = room.admit_review("alice", &lease, &frame)?
        else {
            return Err("review retry not durable".into());
        };
        assert!(duplicate.duplicate);
        let mut through = review.local_writer_clock()?.through.parse()?;
        for redo in [false, true] {
            let observed = review.observe();
            let outcome = if redo {
                author.redo_review_guarded(&author.observe()?, &mut review, &observed)?
            } else {
                author.undo_review_guarded(&author.observe()?, &mut review, &observed)?
            };
            assert!(matches!(outcome, ReviewOutcome::Committed(_)));
            assert!(matches!(
                room.admit_review("alice", &lease, &review.export_frame(through)?)?,
                ReviewAdmission::Durable(_)
            ));
            through = review.local_writer_clock()?.through.parse()?;
        }
        assert!(
            serde_json::to_string(&review.view()?)?.contains("Native offline comment retained")
        );
        Ok(())
    }
}
fn deliver(room: &mut Room, client: &RichReplica, lease: &Lease, after: &str) -> Result<String> {
    let groups: Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, after)?)?;
    for frame in groups["groups"].as_array().ok_or("native groups")? {
        assert!(matches!(
            room.admit("alice", lease, frame.as_str().ok_or("frame")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("native through")?.into())
}
