//! Recomputed file hashes do not admit invalid native actions/history or rewritten seal cuts.
use super::{
    super::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId,
        ReviewOutcome, ReviewPrincipalId, ReviewSession, ReviewThreadId,
        actions::{CreateReviewThread, ReplyToReviewThread, ReviewAction},
        event::Payload,
    },
    encode_segment::encode_active,
    history::file_digest,
    record::{Archive, ArchiveRef, Segment, SegmentRef},
};
use crate::{rich_content::DocumentId, schema::SchemaFingerprint};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn policy() -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new("101")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })
}
fn binding() -> Result<ReviewBinding> {
    Ok(ReviewBinding::new(
        &DocumentId::try_new("room")?,
        format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
    ))
}
fn create_thread(owner: &mut ReviewSession, body: &str) -> Result<ReviewEventId> {
    let anchor = serde_json::json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    let ReviewOutcome::Committed(id) = owner.dispatch(
        &owner.observe(),
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor, body: body.into() }),
    )?
    else {
        return Err("missing birth".into());
    };
    Ok(id)
}

fn fixture() -> Result<ReviewSession> {
    let mut a = ReviewSession::new(binding()?, policy()?)?;
    let id = create_thread(&mut a, "Root")?;
    a.enable_segmented_history_guarded(&a.observe(), "root".into(), "one".into())?;
    for body in ["First", "Second"] {
        a.dispatch(
            &a.observe(),
            ReviewAction::Reply(ReplyToReviewThread {
                thread: ReviewThreadId::from_event(id.clone()),
                body: body.into(),
            }),
        )?;
    }
    a.seal_history_generation_guarded(&a.observe(), "two".into())?;
    a.undo(&a.observe())?;
    a.seal_history_generation_guarded(&a.observe(), "three".into())?;
    Ok(a)
}

fn rewrite(
    archive: &Archive,
    cut: usize,
    mut mutate: impl FnMut(&mut Segment) -> Result,
) -> Result<String> {
    let mut previous = file_digest(&archive.root)?;
    let mut parent = archive.root_generation.clone();
    let mut strings = vec![];
    for (i, json) in archive.sealed.iter().chain(std::iter::once(&archive.active)).enumerate() {
        let mut segment: Segment = serde_json::from_str(json)?;
        if i == cut {
            mutate(&mut segment)?;
        }
        let encoded = serde_json::to_string(&SegmentRef {
            format: &segment.format,
            format_version: segment.format_version,
            generation: &segment.generation,
            parent_generation: &parent,
            parent_sha256: &previous,
            event_offset: segment.event_offset,
            events: &segment.events,
            history: &segment.history,
            cursor: segment.cursor,
        })?;
        parent = segment.generation;
        previous = file_digest(&encoded)?;
        strings.push(encoded);
    }
    let active = strings.pop().ok_or("missing active")?;
    Ok(serde_json::to_string(&ArchiveRef {
        format: &archive.format,
        format_version: archive.format_version,
        root_generation: &archive.root_generation,
        root: &archive.root,
        sealed: strings.iter().map(String::as_str).collect(),
        active: &active,
        continued_after: archive.continued_after,
    })?)
}

#[test]
fn canonical_rehashed_archives_still_replay_native_actions_histories_and_event_chains() -> Result {
    let owner = fixture()?;
    let exact = owner.segmented_checkpoint_json()?;
    let archive: Archive = serde_json::from_str(&exact)?;
    for mutation in 0..4 {
        let changed = rewrite(&archive, 0, |segment| {
            match mutation {
                0 => {
                    let Payload::Action(ReviewAction::Reply(action)) =
                        &mut segment.events[0].payload
                    else {
                        return Err("wrong fixture action".into());
                    };
                    action.body.clear();
                }
                1 => segment.cursor = 0,
                2 => segment.events.reverse(),
                3 => segment.events[0].previous_digest = format!("sha256:{}", "f".repeat(64)),
                _ => return Err("wrong mutation".into()),
            }
            Ok(())
        })?;
        let error = ReviewSession::restore_segmented_json(&binding()?, policy()?, &changed)
            .err()
            .ok_or("accepted forged archive")?;
        match mutation {
            0 => assert!(matches!(error, ReviewError::Contract("empty message"))),
            1 => assert!(matches!(error, ReviewError::Contract("review history replay"))),
            2 | 3 => assert!(matches!(error, ReviewError::Fork)),
            _ => unreachable!(),
        }
        assert_eq!(owner.segmented_checkpoint_json()?, exact);
    }
    Ok(())
}

fn peer_policy(actor: &str) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(actor)?,
        access: ReviewAccess::Comment,
    })
}

#[test]
fn continued_restore_validates_late_causal_inputs_and_exact_intermediate_history() -> Result {
    let mut owner = fixture()?;
    let owner_policy = policy()?;
    let earlier = peer_policy("090")?;
    let later = peer_policy("120")?;
    let mut peer = ReviewSession::new(binding()?, earlier.clone())?;
    create_thread(&mut peer, "Late arrival that sorts before the root")?;

    owner.redo(&owner.observe())?;
    owner.receive_authorized(&owner.observe(), &earlier, &peer.export_frame(0)?)?;
    owner.seal_history_generation_guarded(&owner.observe(), "four".into())?;
    peer.receive_authorized(&peer.observe(), &owner_policy, &owner.export_frame(0)?)?;
    create_thread(&mut peer, "Observes the original actor and the late arrival")?;
    owner.receive_authorized(&owner.observe(), &earlier, &peer.export_frame(1)?)?;
    owner.continue_history_guarded(&owner.observe(), "continued".into())?;

    let mut third = ReviewSession::new(binding()?, later.clone())?;
    third.receive_authorized(&third.observe(), &owner_policy, &owner.export_frame(0)?)?;
    third.receive_authorized(&third.observe(), &earlier, &peer.export_frame(0)?)?;
    create_thread(&mut third, "Observes both streams after continuation")?;
    owner.receive_authorized(&owner.observe(), &later, &third.export_frame(0)?)?;

    let exact = owner.continued_checkpoint_json()?;
    let mut cold =
        ReviewSession::restore_continued_json(&binding()?, owner_policy.clone(), &exact)?;
    assert_eq!(cold.continued_checkpoint_json()?, exact);
    assert_eq!(cold.view()?, owner.view()?);
    for target in [&mut owner, &mut cold] {
        target.undo(&target.observe())?;
        target.redo(&target.observe())?;
    }
    assert_eq!(cold.continued_checkpoint_json()?, owner.continued_checkpoint_json()?);

    let archive: Archive = serde_json::from_str(&exact)?;
    let invalid_intermediate = rewrite(&archive, 1, |segment| {
        segment.history.push(segment.history[0].clone());
        Ok(())
    })?;
    assert!(matches!(
        ReviewSession::restore_continued_json(
            &binding()?,
            owner_policy.clone(),
            &invalid_intermediate
        ),
        Err(ReviewError::Contract("review history replay"))
    ));
    let corrupt_frontier = rewrite(&archive, archive.sealed.len(), |segment| {
        assert!(segment.events[0].dependencies.remove(&owner_policy.actor).is_some());
        Ok(())
    })?;
    assert!(matches!(
        ReviewSession::restore_continued_json(&binding()?, owner_policy.clone(), &corrupt_frontier),
        Err(ReviewError::Contract("nonclosed review causal frontier"))
    ));
    let independent_failures = rewrite(&archive, 2, |segment| {
        segment.events[0].previous_digest = format!("sha256:{}", "f".repeat(64));
        let Payload::Action(ReviewAction::CreateThread(action)) = &mut segment.events[1].payload
        else {
            return Err("missing independent peer action".into());
        };
        action.body.clear();
        Ok(())
    })?;
    assert!(matches!(
        ReviewSession::restore_continued_json(&binding()?, owner_policy, &independent_failures),
        Err(ReviewError::Contract("empty message"))
    ));
    Ok(())
}

#[test]
fn re_slicing_the_same_events_does_not_manufacture_a_retained_generation_origin() -> Result {
    let mut a = fixture()?;
    let mut b = ReviewSession::restore_segmented_json(
        &binding()?,
        policy()?,
        &a.segmented_checkpoint_json()?,
    )?;
    // Both actual owners retain the same new events, but choose different seal cuts.
    a.redo(&a.observe())?;
    b.redo(&b.observe())?;
    a.seal_history_generation_guarded(&a.observe(), "four".into())?;
    a.undo(&a.observe())?;
    b.undo(&b.observe())?;
    b.seal_history_generation_guarded(&b.observe(), "four".into())?;
    assert_eq!(a.events, b.events);
    assert_eq!(a.view()?, b.view()?);
    assert!(a.verify_recovery_origin_guarded(&a.observe(), &b, &b.observe()).is_err());
    assert!(b.verify_recovery_origin_guarded(&b.observe(), &a, &a.observe()).is_err());
    assert_ne!(encode_active(&a)?, encode_active(&b)?);
    Ok(())
}
