//! Server-authored content injection through the SAME native shared commands and durable writer
//! admission used by browser editors. The service principal owns an ordinary registered writer
//! (never a reserved or forged one); its replica is a normal client replica whose one-command-batch
//! becomes one native history group and one durable `Commit` record. Connected clients receive it
//! through the ordinary catchup notification as a remote change.
use crate::{Admission, DurableReceipt, Error, Lease, Result, Room};
use breditor_collab_feasibility::rich_replica::{Command, RichReplica};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

/// Rotate the service writer after this many injections so restart replay and the persisted
/// journal stay bounded. Each rotation consumes one ordinary writer registration.
const ROTATE_AFTER: u32 = 256;
const MAX_STATE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stored {
    format: String,
    format_version: u32,
    document: String,
    principal: String,
    writer: String,
    credential: String,
    injections: u32,
    journal: String,
}
struct Session {
    writer: String,
    credential: String,
    lease: Lease,
    replica: RichReplica,
    injections: u32,
}
pub(super) enum Outcome {
    Unchanged,
    Durable(DurableReceipt),
}
pub(super) enum Failure {
    Stale,
    Relay(Error),
}
impl From<Error> for Failure {
    fn from(error: Error) -> Self {
        Self::Relay(error)
    }
}
impl From<breditor_collab_feasibility::Error> for Failure {
    fn from(error: breditor_collab_feasibility::Error) -> Self {
        Self::Relay(error.into())
    }
}
impl From<serde_json::Error> for Failure {
    fn from(error: serde_json::Error) -> Self {
        Self::Relay(error.into())
    }
}

/// Host custody of one room's service writer: lease in memory, credential + journal in a 0600
/// host-owned state file, exactly like a browser keeps its separate credential and journal.
pub(super) struct ServiceWriter {
    path: PathBuf,
    principal: String,
    session: Option<Session>,
}
impl ServiceWriter {
    pub(super) fn new(path: PathBuf, principal: String) -> Self {
        Self { path, principal, session: None }
    }
    pub(super) fn path(&self) -> &Path {
        &self.path
    }
    fn persist(&self, room: &Room, session: &Session) -> Result<()> {
        let stored = Stored {
            format: "breditor/relay-service-writer".into(),
            format_version: 1,
            document: room.shared_document_id().into(),
            principal: self.principal.clone(),
            writer: session.writer.clone(),
            credential: session.credential.clone(),
            injections: session.injections,
            journal: session.replica.checkpoint()?,
        };
        let bytes = serde_json::to_vec(&stored)?;
        let staging = self.path.with_extension("service.staging");
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut file = options.open(&staging)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&staging, &self.path)?;
        if let Some(parent) = self.path.parent() {
            fs::File::open(parent)?.sync_all()?;
        }
        Ok(())
    }
    fn load(&self, room: &mut Room) -> Result<Option<Session>> {
        let Ok(file) = fs::File::open(&self.path) else { return Ok(None) };
        if file.metadata()?.len() > MAX_STATE_BYTES {
            return Err(Error::Contract("service writer state budget"));
        }
        let stored: Stored = serde_json::from_reader(std::io::BufReader::new(file))?;
        if stored.format != "breditor/relay-service-writer"
            || stored.format_version != 1
            || stored.document != room.shared_document_id()
            || stored.principal != self.principal
        {
            return Err(Error::Contract("service writer state binding"));
        }
        let lease = match room.resume(&self.principal, &stored.writer, &stored.credential) {
            Ok(lease) => lease,
            // A lost registration or a replaced room log: allocate a fresh ordinary writer.
            Err(Error::Lease) => return Ok(None),
            Err(error) => return Err(error),
        };
        let replica = room.shared_profile().restore(room.shared_document_id(), &stored.journal)?;
        Ok(Some(Session {
            writer: stored.writer,
            credential: stored.credential,
            lease,
            replica,
            injections: stored.injections,
        }))
    }
    fn register(&self, room: &mut Room) -> Result<Session> {
        let registration = room.register(&self.principal)?;
        let replica = room.shared_profile().join_frame(
            room.shared_document_id().into(),
            registration.lease.writer.clone(),
            &room.catchup(&self.principal)?,
        )?;
        let session = Session {
            writer: registration.lease.writer.clone(),
            credential: registration.credential,
            lease: registration.lease,
            replica,
            injections: 0,
        };
        // Save the credential before authoring, as every browser client must.
        self.persist(room, &session)?;
        Ok(session)
    }
    fn accepted_through(room: &Room, principal: &str, writer: &str) -> Result<String> {
        let clock = room.writer_clock(principal, writer)?;
        clock["through"].as_str().map(String::from).ok_or(Error::Contract("writer clock"))
    }
    fn local_through(room: &Room, replica: &RichReplica) -> Result<String> {
        Ok(if room.writer_transport_version() == 2 {
            replica.writer_clock_v2(replica.writer())?.through
        } else {
            replica.writer_clock(replica.writer())?.through
        })
    }
    /// A ready session whose own stream exactly matches durable acceptance, rotated if needed.
    fn ready(&mut self, room: &mut Room) -> Result<Session> {
        let mut session = match self.session.take() {
            Some(session) => Some(session),
            None => self.load(room)?,
        };
        if let Some(current) = &session {
            let consistent = current.injections < ROTATE_AFTER
                && Self::local_through(room, &current.replica)?
                    == Self::accepted_through(room, &self.principal, &current.writer)?;
            if !consistent {
                room.release(&current.lease);
                session = None;
            }
        }
        match session {
            Some(session) => Ok(session),
            None => self.register(room),
        }
    }
    /// Apply one bounded command batch at exactly `base` as the service principal.
    pub(super) fn inject(
        &mut self,
        room: &mut Room,
        base: &str,
        commands: Vec<Command>,
    ) -> std::result::Result<Outcome, Failure> {
        if base != room.document_revision()? {
            return Err(Failure::Stale);
        }
        room.require_editor(&self.principal)?;
        let mut session = self.ready(room)?;
        let result = Self::author(room, &self.principal, &mut session, base, commands);
        match result {
            Ok(Outcome::Durable(receipt)) => {
                session.injections += 1;
                // The edit is already durable. If saving the journal fails, drop the session: the
                // next injection sees a clock mismatch and rotates to a fresh writer.
                if self.persist(room, &session).is_ok() {
                    self.session = Some(session);
                }
                Ok(Outcome::Durable(receipt))
            }
            Ok(Outcome::Unchanged) => {
                self.session = Some(session);
                Ok(Outcome::Unchanged)
            }
            Err(error) => {
                // The in-memory replica may now hold an unpublished local action. Never reuse it:
                // reload the last durable journal (or rotate) on the next request.
                room.release(&session.lease);
                Err(error)
            }
        }
    }
    fn author(
        room: &mut Room,
        principal: &str,
        session: &mut Session,
        base: &str,
        commands: Vec<Command>,
    ) -> std::result::Result<Outcome, Failure> {
        session.replica.receive_frame(&room.catchup(principal)?)?;
        if session.replica.causal_version() != base {
            return Err(Failure::Relay(Error::Contract("service replica differs from room")));
        }
        let after = Self::local_through(room, &session.replica)?;
        // Native stale-coordinate refusal: one ordered batch, one writer-local history group.
        if !session.replica.apply_at(base, commands)? {
            return Ok(Outcome::Unchanged);
        }
        let observation = session.replica.observe()?;
        let batch = if room.writer_transport_version() == 2 {
            session.replica.writer_groups_v2_guarded(&observation, &after)?
        } else {
            session.replica.writer_groups_guarded(&observation, &after)?
        };
        let batch: serde_json::Value = serde_json::from_str(&batch)?;
        let groups = batch["groups"].as_array().ok_or(Error::Contract("service writer groups"))?;
        let [group] = groups.as_slice() else {
            return Err(Failure::Relay(Error::Contract("service injection must be one group")));
        };
        if batch["hasMore"] != serde_json::Value::Bool(false) {
            return Err(Failure::Relay(Error::Contract("service injection must be one group")));
        }
        let group = group.as_str().ok_or(Error::Contract("service writer group"))?;
        match room.admit(principal, &session.lease, group)? {
            Admission::Durable(receipt) => Ok(Outcome::Durable(receipt)),
            Admission::Pending { .. } => {
                Err(Failure::Relay(Error::Contract("service injection dependencies")))
            }
        }
    }
}
