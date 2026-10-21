use super::*;
use crate::log::{Event, Log};
use std::io::Write;

fn input(room: &mut Room, profile: &SharedRichProfile, lane: Lane) -> TestResult {
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let mut doc = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    match lane {
        Lane::Document => {
            insert(&mut doc, "Received ")?;
            send_document(room, "alice", &doc, &registration.lease, "0", true)?;
        }
        Lane::Review => {
            room.grant_review("owner", "alice", Some(ReviewRole::Moderator))?;
            let writer = room.register_review("alice", ReviewActorId::try_new("alice.review")?)?;
            let mut review = doc.create_review_session(policy("alice.review", "alice")?)?;
            comment(&doc, &mut review, "Received")?;
            send_review(room, "alice", &review, &writer.lease, 0)?;
        }
    }
    Ok(())
}

#[test]
fn refused_and_uncertain_boundaries_never_publish_candidates_or_remove_durable_input() -> TestResult
{
    for lane in [Lane::Document, Lane::Review] {
        for sealing in [false, true] {
            let files = Files::new()?;
            let (profile, mut room) = start(&files, 3, true, true)?;
            room.enable_review("owner")?;
            room.grant("owner", "reader", Some(Role::Reader))?;
            assert!(matches!(
                room.native_history_checkpoint("reader", lane),
                Err(Error::Permission)
            ));
            let denied = match lane {
                Lane::Document => room.enable_document_history_generations(
                    "reader",
                    "root".into(),
                    "active".into(),
                ),
                Lane::Review => {
                    room.enable_review_history_generations("reader", "root".into(), "active".into())
                }
            };
            assert!(matches!(denied, Err(Error::Permission)));
            let before = room.native_history_checkpoint("owner", lane)?;
            let bytes = fs::read(files.path("source.log"))?;
            let invalid = match lane {
                Lane::Document => {
                    room.enable_document_history_generations("owner", "same".into(), "same".into())
                }
                Lane::Review => {
                    room.enable_review_history_generations("owner", "same".into(), "same".into())
                }
            };
            assert!(invalid.is_err());
            assert_eq!(room.native_history_checkpoint("owner", lane)?, before);
            assert_eq!(fs::read(files.path("source.log"))?, bytes);
            if sealing {
                enable(&mut room, lane)?;
                let cut = room.native_history_checkpoint("owner", lane)?;
                let bytes = fs::read(files.path("source.log"))?;
                assert!(seal(&mut room, lane, "empty").is_err());
                assert_eq!(room.native_history_checkpoint("owner", lane)?, cut);
                assert_eq!(fs::read(files.path("source.log"))?, bytes);
                input(&mut room, &profile, lane)?;
            }
            let before = room.native_history_checkpoint("owner", lane)?;
            let bytes = fs::read(files.path("source.log"))?;
            room.log.use_read_only_handle_for_test(&files.path("source.log"))?;
            let result =
                if sealing { seal(&mut room, lane, "next") } else { enable(&mut room, lane) };
            assert!(matches!(result, Err(Error::Io(_))));
            assert!(matches!(room.native_history_descriptor("owner"), Err(Error::NeedsRecovery)));
            let actual = match lane {
                Lane::Document => super::super::checkpoint::document_checkpoint(&room.replica)?,
                Lane::Review => super::super::checkpoint::review_checkpoint(
                    &room.review.as_ref().ok_or("review")?.session,
                )?,
            };
            assert_eq!(actual, before);
            assert_eq!(fs::read(files.path("source.log"))?, bytes);
            drop(room);
            let (room, recovered) = Room::open(&files.path("source.log"))?;
            assert_eq!(recovered.truncated_bytes, 0);
            assert_eq!(room.native_history_checkpoint("owner", lane)?, before);
        }
    }
    Ok(())
}

#[test]
fn synced_boundary_replays_exactly_after_interruption_before_in_memory_publication() -> TestResult {
    for lane in [Lane::Document, Lane::Review] {
        for sealing in [false, true] {
            let files = Files::new()?;
            let (profile, mut room) = start(&files, 3, true, true)?;
            room.enable_review("owner")?;
            if sealing {
                enable(&mut room, lane)?;
                input(&mut room, &profile, lane)?;
            }
            let before = room.native_history_checkpoint("owner", lane)?;
            let boundary = if sealing {
                NativeHistoryBoundary::Seal { next: "next".into() }
            } else {
                NativeHistoryBoundary::Enable { root: "root".into(), active: "active".into() }
            };
            let candidate = room.prepare_native_history(lane, &boundary)?;
            let expected = match &candidate.candidate {
                super::super::prepare::NativeHistoryCandidate::Document { receiver, .. } => {
                    super::super::checkpoint::document_checkpoint(receiver)?
                }
                super::super::prepare::NativeHistoryCandidate::Review(receiver) => {
                    super::super::checkpoint::review_checkpoint(receiver)?
                }
            };
            room.log.append(Event::NativeHistoryBoundaryV1 {
                actor: "owner".into(),
                lane,
                boundary,
                before: candidate.before,
                after: candidate.after,
            })?;
            assert_eq!(room.native_history_checkpoint("owner", lane)?, before);
            drop(candidate);
            drop(room);
            let bytes = fs::read(files.path("source.log"))?;
            let (room, _) = Room::open(&files.path("source.log"))?;
            assert_eq!(room.native_history_checkpoint("owner", lane)?, expected);
            assert_eq!(fs::read(files.path("source.log"))?, bytes);
        }
    }
    Ok(())
}

#[test]
fn correct_log_hashes_do_not_admit_forged_native_cuts_or_trim_their_torn_tail() -> TestResult {
    for lane in [Lane::Document, Lane::Review] {
        let files = Files::new()?;
        let (_, mut room) = start(&files, 3, true, true)?;
        room.enable_review("owner")?;
        enable(&mut room, lane)?;
        drop(room);
        for mutation in 0..5 {
            let (source, mut records, recovery) = Log::open(&files.path("source.log"))?;
            assert_eq!(recovery.truncated_bytes, 0);
            drop(source);
            let seed = records.remove(0);
            let target = files.path(&format!("mutated-{mutation}.log"));
            let mut log = Log::create(&target, seed.event)?;
            for record in records {
                let mut event = record.event;
                if let Event::NativeHistoryBoundaryV1 { actor, boundary, before, after, .. } =
                    &mut event
                {
                    match mutation {
                        0 => {}
                        1 => actor.clone_from(&"reader".to_owned()),
                        2 => before[0] ^= 1,
                        3 => after[0] ^= 1,
                        _ => {
                            *boundary = NativeHistoryBoundary::Enable {
                                root: "changed".into(),
                                active: "active".into(),
                            }
                        }
                    }
                }
                log.append(event)?;
            }
            drop(log);
            if mutation == 0 {
                let (room, _) = Room::open(&target)?;
                drop(room);
                continue;
            }
            let mut append = fs::OpenOptions::new().append(true).open(&target)?;
            append.write_all(b"torn")?;
            append.sync_all()?;
            drop(append);
            let bytes = fs::read(&target)?;
            assert!(Room::open(&target).is_err());
            assert_eq!(fs::read(&target)?, bytes);
        }
    }
    Ok(())
}

#[test]
fn exact_boundary_retries_keep_the_original_receipt_without_sealing_newer_native_input()
-> TestResult {
    for lane in [Lane::Document, Lane::Review] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, 3, true, true)?;
        room.enable_review("owner")?;
        let initial =
            NativeHistoryBoundary::Enable { root: "root".into(), active: "active".into() };
        let original = room.commit_native_history("owner", lane, initial.clone())?;
        assert!(!original.duplicate);
        input(&mut room, &profile, lane)?;
        let boundary = NativeHistoryBoundary::Seal { next: "second".into() };
        let sealed = room.commit_native_history("owner", lane, boundary.clone())?;
        assert!(sealed.sequence.parse::<u64>()? > original.sequence.parse::<u64>()?);
        let bytes = fs::read(files.path("source.log"))?;
        let cut = room.native_history_checkpoint("owner", lane)?;
        for (intent, expected) in
            [(initial.clone(), original.clone()), (boundary.clone(), sealed.clone())]
        {
            let mut duplicate = room.commit_native_history("owner", lane, intent)?;
            assert!(duplicate.duplicate);
            duplicate.duplicate = false;
            assert_eq!(duplicate, expected);
        }
        assert_eq!(fs::read(files.path("source.log"))?, bytes);
        assert_eq!(room.native_history_checkpoint("owner", lane)?, cut);
        assert!(matches!(
            room.commit_native_history("alice", lane, initial.clone()),
            Err(Error::Permission)
        ));
        drop(room);
        let (mut room, _) = Room::open(&files.path("source.log"))?;
        for (intent, expected) in [(initial, original), (boundary, sealed)] {
            let mut duplicate = room.commit_native_history("owner", lane, intent)?;
            assert!(duplicate.duplicate);
            duplicate.duplicate = false;
            assert_eq!(duplicate, expected);
        }
        assert_eq!(fs::read(files.path("source.log"))?, bytes);
        assert_eq!(room.native_history_checkpoint("owner", lane)?, cut);
    }
    Ok(())
}
