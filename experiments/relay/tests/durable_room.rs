//! Functional reference-host recovery, permission and offline writer contract checks.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{InsertText, ResizeColumn, SetImageAlt},
};
use breditor_collab_relay::{Admission, Error, Lease, Registration, Role, Room};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Files {
    dir: PathBuf,
    path: PathBuf,
}
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "breditor-relay-{}-{nonce}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir)?;
        Ok(Self { path: dir.join("room.log"), dir })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        for name in ["room.log", "copy.log"] {
            let _ = fs::remove_file(self.dir.join(name));
        }
        let _ = fs::remove_dir(&self.dir);
    }
}
fn profile() -> Result<(SharedRichProfile, String, String)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":1,
        "schema":{"name":"example/durable-relay","version":1},"extensions":[]})
    .to_string();
    let p = SharedRichProfile::from_configuration_json(&configuration)?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/durable-relay","version":1},
        "schemaFingerprint":p.schema().fingerprint().to_string(),"root":root})
    .to_string();
    Ok((p, configuration, document))
}
fn start(files: &Files) -> Result<(SharedRichProfile, Room)> {
    let (p, config, document) = profile()?;
    Ok((p, Room::create(&files.path, &config, &document, "owner")?))
}
fn join(
    p: &SharedRichProfile,
    room: &mut Room,
    principal: &str,
) -> Result<(Registration, RichReplica)> {
    room.grant("owner", principal, Some(Role::Editor))?;
    let registration = room.register(principal)?;
    let editor =
        p.join_frame("room".into(), registration.lease.writer.clone(), &room.catchup(principal)?)?;
    Ok((registration, editor))
}
fn groups(editor: &RichReplica, after: &str) -> Result<Vec<String>> {
    let b: Value = serde_json::from_str(&editor.writer_groups_guarded(&editor.observe()?, after)?)?;
    Ok(b["groups"]
        .as_array()
        .ok_or("groups")?
        .iter()
        .map(|v| v.as_str().map(str::to_owned).ok_or("group"))
        .collect::<std::result::Result<_, _>>()?)
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn ack(outcome: Admission) -> Result<breditor_collab_relay::DurableReceipt> {
    let Admission::Durable(receipt) = outcome else {
        return Err("expected durable acceptance".into());
    };
    Ok(receipt)
}

#[test]
fn offline_rich_groups_recover_server_and_selective_client_history_with_original_durable_receipts()
-> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    let (ra, mut a) = join(&p, &mut room, "alice")?;
    let (rb, mut b) = join(&p, &mut room, "bob")?;
    a.apply(vec![
        insert("p", "Alice 🙂 "),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 320,
        }),
    ])?;
    b.apply(vec![
        insert("caption", "Bob "),
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Shared image".into(),
            decorative: false,
        }),
    ])?;
    let ag = groups(&a, "0")?.remove(0);
    let bg = groups(&b, "0")?.remove(0);
    let accepted = ack(room.admit("alice", &ra.lease, &ag)?)?;
    assert!(!accepted.duplicate);
    let through = accepted.receipt.through.clone();
    drop(room);
    let (mut room, recovered) = Room::open(&files.path)?;
    assert_eq!(recovered.truncated_bytes, 0);
    assert!(matches!(room.admit("alice", &ra.lease, &ag), Err(Error::Lease)));
    let lease = room.resume("alice", &ra.lease.writer, &ra.credential)?;
    let retried = ack(room.admit("alice", &lease, &ag)?)?;
    assert!(retried.duplicate);
    assert_eq!(retried.sequence, accepted.sequence);
    assert_eq!(retried.receipt, accepted.receipt);
    let bl = room.resume("bob", &rb.lease.writer, &rb.credential)?;
    ack(room.admit("bob", &bl, &bg)?)?;
    a.receive_frame(&room.catchup("alice")?)?;
    b.receive_frame(&room.catchup("bob")?)?;
    assert_eq!(a.document_json(), b.document_json());
    let journal = a.checkpoint()?;
    a = p.restore("room", &journal)?;
    a.undo()?;
    let undone = a.document_json().to_owned();
    assert!(undone.contains("Bob "));
    a.redo()?;
    for group in groups(&a, &through)? {
        ack(room.admit("alice", &lease, &group)?)?;
    }
    let expected = a.document_json().to_owned();
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    let viewer = p.join_frame("room".into(), "999".into(), &room.catchup("owner")?)?;
    assert_eq!(viewer.document_json(), expected);
    assert_eq!(
        room.writer_clock("alice", &ra.lease.writer)?["through"],
        a.writer_clock(&ra.lease.writer)?.through
    );
    assert_eq!(a.undo_count(), 1);
    assert_eq!(b.undo_count(), 1);
    Ok(())
}

#[test]
fn pending_groups_and_rejections_are_not_durable_acceptances_and_catchup_unblocks_dependencies()
-> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    let (ra, mut a) = join(&p, &mut room, "alice")?;
    let (rb, mut b) = join(&p, &mut room, "bob")?;
    a.apply(vec![insert("p", "First ")])?;
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![insert("caption", "Dependent ")])?;
    a.apply(vec![insert("p", "Second ")])?;
    let ag = groups(&a, "0")?;
    let bg = groups(&b, "0")?.remove(0);
    let bytes = fs::metadata(&files.path)?.len();
    assert!(matches!(room.admit("alice", &ra.lease, &ag[1])?, Admission::Pending { .. }));
    assert!(matches!(room.admit("bob", &rb.lease, &bg)?, Admission::Pending { .. }));
    assert!(room.admit("alice", &ra.lease, &bg).is_err());
    assert_eq!(fs::metadata(&files.path)?.len(), bytes);
    assert_eq!(room.writer_clock("alice", &ra.lease.writer)?["through"], "0");
    ack(room.admit("alice", &ra.lease, &ag[0])?)?;
    ack(room.admit("bob", &rb.lease, &bg)?)?;
    ack(room.admit("alice", &ra.lease, &ag[1])?)?;
    a.receive_frame(&room.catchup("alice")?)?;
    b.receive_frame(&room.catchup("bob")?)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn role_changes_fence_writers_and_old_disconnects_cannot_release_new_connections() -> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    assert!(matches!(room.catchup("unknown"), Err(Error::Permission)));
    assert!(matches!(room.register("unknown"), Err(Error::Permission)));
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.catchup("reader")?;
    assert!(matches!(room.register("reader"), Err(Error::Permission)));
    assert!(matches!(room.grant("reader", "x", Some(Role::Editor)), Err(Error::Permission)));
    let (r, mut a) = join(&p, &mut room, "alice")?;
    a.apply(vec![insert("p", "Owned ")])?;
    let group = groups(&a, "0")?.remove(0);
    assert!(room.resume("owner", &r.lease.writer, &r.credential).is_err());
    assert!(room.resume("alice", &r.lease.writer, &"0".repeat(64)).is_err());
    let next = room.resume("alice", &r.lease.writer, &r.credential)?;
    assert!(matches!(room.admit("alice", &r.lease, &group), Err(Error::Lease)));
    room.release(&r.lease);
    ack(room.admit("alice", &next, &group)?)?;
    room.grant("owner", "alice", Some(Role::Reader))?;
    assert!(matches!(room.admit("alice", &next, &group), Err(Error::Permission)));
    room.grant("owner", "alice", Some(Role::Editor))?;
    assert!(matches!(room.admit("alice", &next, &group), Err(Error::Lease)));
    let again = room.resume("alice", &next.writer, &r.credential)?;
    assert!(ack(room.admit("alice", &again, &group)?)?.duplicate);
    room.grant("owner", "alice", None)?;
    assert!(matches!(room.catchup("alice"), Err(Error::Permission)));
    drop(room);
    let (mut room, _) = Room::open(&files.path)?;
    assert!(matches!(room.resume("alice", &again.writer, &r.credential), Err(Error::Permission)));
    room.grant("owner", "alice", Some(Role::Editor))?;
    let allocated = room.register("alice")?;
    assert_ne!(allocated.lease.writer, again.writer);
    assert!(room.grant("owner", "owner", None).is_err());
    Ok(())
}

#[test]
fn room_log_is_exclusive_private_and_never_contains_clear_resume_or_session_credentials() -> Result
{
    let files = Files::new()?;
    let (_, mut room) = start(&files)?;
    assert!(matches!(Room::open(&files.path), Err(Error::Locked)));
    let reg = room.register("owner")?;
    let bytes = fs::read(&files.path)?;
    for secret in [&reg.credential, &reg.lease.token] {
        assert!(!bytes.windows(secret.len()).any(|part| part == secret.as_bytes()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::metadata(&files.path)?.permissions().mode() & 0o777, 0o600);
    }
    let (_, config, document) = profile()?;
    assert!(Room::create(&files.path, &config, &document, "owner").is_err());
    assert_eq!(fs::read(&files.path)?, bytes);
    drop(room);
    Room::open(&files.path)?;
    Ok(())
}

#[test]
fn torn_final_append_recovers_only_prior_records_and_complete_lost_reply_remains_accepted() -> Result
{
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    let (r, mut editor) = join(&p, &mut room, "alice")?;
    let before = fs::read(&files.path)?;
    editor.apply(vec![insert("p", "Crash boundary ")])?;
    let group = groups(&editor, "0")?.remove(0);
    let original = ack(room.admit("alice", &r.lease, &group)?)?;
    drop(room);
    let complete = fs::read(&files.path)?;
    let copy = files.dir.join("copy.log");
    for keep in [1, 12, 39, 40, 71, 72, (complete.len() - before.len()) / 2] {
        fs::write(&copy, &complete[..before.len() + keep])?;
        let (mut recovered, report) = Room::open(&copy)?;
        assert_eq!(report.truncated_bytes, u64::try_from(keep)?);
        assert_eq!(fs::metadata(&copy)?.len(), u64::try_from(before.len())?);
        assert_eq!(recovered.writer_clock("alice", &r.lease.writer)?["through"], "0");
        let lease = recovered.resume("alice", &r.lease.writer, &r.credential)?;
        assert!(!ack(recovered.admit("alice", &lease, &group)?)?.duplicate);
    }
    let (mut recovered, report) = Room::open(&files.path)?;
    assert_eq!(report.truncated_bytes, 0);
    let lease = recovered.resume("alice", &r.lease.writer, &r.credential)?;
    let duplicate = ack(recovered.admit("alice", &lease, &group)?)?;
    assert!(duplicate.duplicate);
    assert_eq!(duplicate.sequence, original.sequence);
    assert_eq!(fs::read(&files.path)?, complete);
    Ok(())
}

#[test]
fn corrupt_complete_record_never_gets_silently_truncated_as_a_torn_tail() -> Result {
    let files = Files::new()?;
    let (_, mut room) = start(&files)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    drop(room);
    let mut corrupt = fs::read(&files.path)?;
    let end = corrupt.len() - 1;
    corrupt[end] ^= 1;
    fs::write(&files.path, &corrupt)?;
    assert!(Room::open(&files.path).is_err());
    assert_eq!(fs::read(&files.path)?, corrupt);
    // Even with an incomplete suffix, corruption in a complete predecessor is not repaired away.
    let mut f = fs::OpenOptions::new().append(true).open(&files.path)?;
    f.write_all(&[1, 2, 3])?;
    f.sync_all()?;
    corrupt.extend([1, 2, 3]);
    assert!(Room::open(&files.path).is_err());
    assert_eq!(fs::read(&files.path)?, corrupt);
    Ok(())
}

#[test]
fn forged_session_values_and_cross_account_writer_claims_do_not_touch_the_log() -> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    let (alice, mut a) = join(&p, &mut room, "alice")?;
    let (bob, _) = join(&p, &mut room, "bob")?;
    a.apply(vec![insert("p", "Actual author ")])?;
    let group = groups(&a, "0")?.remove(0);
    let bytes = fs::read(&files.path)?;
    let forged = Lease { writer: alice.lease.writer.clone(), token: bob.lease.token.clone() };
    assert!(room.admit("bob", &forged, &group).is_err());
    assert!(room.admit("alice", &forged, &group).is_err());
    assert!(room.admit("bob", &bob.lease, &group).is_err());
    assert_eq!(fs::read(&files.path)?, bytes);
    Ok(())
}

#[test]
fn corrupt_length_cannot_disguise_a_complete_accepted_record_as_an_incomplete_tail() -> Result {
    let files = Files::new()?;
    let (_, mut room) = start(&files)?;
    let offset = usize::try_from(fs::metadata(&files.path)?.len())?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    drop(room);
    let mut corrupt = fs::read(&files.path)?;
    // A plausible larger length would look torn without an independently checked header digest.
    corrupt[offset + 6] ^= 1;
    fs::write(&files.path, &corrupt)?;
    assert!(Room::open(&files.path).is_err());
    assert_eq!(fs::read(&files.path)?, corrupt);
    Ok(())
}

#[test]
fn presence_is_authenticated_ephemeral_and_fenced_without_document_or_log_writes() -> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files)?;
    let (alice, a) = join(&p, &mut room, "alice")?;
    let (bob, b) = join(&p, &mut room, "bob")?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let frame = a.presence_frame_guarded(&a.observe()?)?;
    let log = fs::read(&files.path)?;
    let document = room.catchup("owner")?;
    assert!(matches!(room.publish_presence("bob", &bob.lease, "1", &frame), Err(Error::Lease)));
    assert!(matches!(
        room.publish_presence("reader", &alice.lease, "1", &frame),
        Err(Error::Permission)
    ));
    assert!(room.publish_presence("alice", &alice.lease, "9007199254740993", &frame)?);
    assert!(!room.publish_presence("alice", &alice.lease, "9007199254740992", &frame)?);
    let peers = room.presence_snapshot("reader", None)?;
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].label, "alice");
    assert_eq!(peers[0].writer, alice.lease.writer);
    assert_ne!(peers[0].session, alice.lease.token);
    assert_eq!(fs::read(&files.path)?, log);
    assert_eq!(room.catchup("owner")?, document);
    let renewed = room.resume("alice", &alice.lease.writer, &alice.credential)?;
    assert!(room.presence_snapshot("reader", None)?.is_empty());
    assert!(room.publish_presence("alice", &alice.lease, "9007199254740994", &frame).is_err());
    assert!(room.publish_presence("alice", &renewed, "1", &frame)?);
    let next = room.presence_snapshot("reader", None)?;
    assert_ne!(next[0].session, peers[0].session);
    room.release(&alice.lease);
    assert_eq!(room.presence_snapshot("reader", None)?.len(), 1);
    let bframe = b.presence_frame_guarded(&b.observe()?)?;
    room.publish_presence("bob", &bob.lease, "1", &bframe)?;
    room.grant("owner", "alice", None)?;
    assert_eq!(room.presence_snapshot("reader", None)?.len(), 1);
    room.release(&bob.lease);
    assert!(room.presence_snapshot("reader", None)?.is_empty());
    drop(room);
    let (mut recovered, _) = Room::open(&files.path)?;
    assert!(recovered.presence_snapshot("owner", None)?.is_empty());
    Ok(())
}
