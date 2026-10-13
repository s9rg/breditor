//! Replay the ordered ownership journal, including undo/redo, before adopting it.

use loro::{ExportMode, LoroDoc, UndoManager, VersionVector};

type TestResult = Result<(), Box<dyn std::error::Error>>;

#[derive(Clone)]
enum Entry {
    Local(Action, serde_json::Value),
    Remote(Vec<u8>),
    Undo(serde_json::Value),
    Redo(serde_json::Value),
}

#[derive(Clone)]
enum Action {
    Insert { position: usize, text: String },
    SetAssetAndWidth,
}

impl Action {
    fn apply(&self, doc: &LoroDoc) -> TestResult {
        match self {
            Self::Insert { position, text } => {
                doc.get_text("text").insert(*position, text)?;
            }
            Self::SetAssetAndWidth => {
                doc.get_map("column").insert("width", 260)?;
                doc.get_map("image").insert("asset", "asset-1")?;
            }
        }
        doc.commit();
        Ok(())
    }
}

struct JournalReplica {
    peer: u64,
    doc: LoroDoc,
    undo: UndoManager,
    entries: Vec<Entry>,
}

fn change_json(
    doc: &LoroDoc,
    from: &VersionVector,
) -> Result<serde_json::Value, serde_json::Error> {
    serde_json::to_value(doc.export_json_updates_without_peer_compression(from, &doc.oplog_vv()))
}

impl JournalReplica {
    fn new(peer: u64) -> Result<Self, loro::LoroError> {
        let doc = LoroDoc::new();
        doc.set_peer_id(peer)?;
        doc.set_record_timestamp(false);
        doc.get_text("text");
        doc.get_map("cells");
        doc.get_map("column");
        doc.get_map("image");
        doc.get_tree("blocks");
        let mut undo = UndoManager::new(&doc);
        undo.set_merge_interval(0);
        Ok(Self { peer, doc, undo, entries: vec![] })
    }

    fn local(&mut self, action: Action) -> TestResult {
        let before = self.doc.oplog_vv();
        action.apply(&self.doc)?;
        self.entries.push(Entry::Local(action, change_json(&self.doc, &before)?));
        self.check_restart()
    }

    fn remote(&mut self, bytes: Vec<u8>) -> TestResult {
        self.doc.import(&bytes)?;
        self.entries.push(Entry::Remote(bytes));
        self.check_restart()
    }

    fn undo(&mut self) -> TestResult {
        let before = self.doc.oplog_vv();
        assert!(self.undo.undo()?);
        self.entries.push(Entry::Undo(change_json(&self.doc, &before)?));
        self.check_restart()
    }

    fn redo(&mut self) -> TestResult {
        let before = self.doc.oplog_vv();
        assert!(self.undo.redo()?);
        self.entries.push(Entry::Redo(change_json(&self.doc, &before)?));
        self.check_restart()
    }

    fn recover(&self) -> Result<Self, Box<dyn std::error::Error>> {
        let mut result = Self::new(self.peer)?;
        for entry in &self.entries {
            match entry {
                Entry::Local(action, expected) => {
                    let before = result.doc.oplog_vv();
                    action.apply(&result.doc)?;
                    assert_eq!(
                        change_json(&result.doc, &before)?,
                        *expected,
                        "authored command replay must reproduce exact operation identities/effects"
                    );
                }
                Entry::Remote(bytes) => {
                    result.doc.import(bytes)?;
                }
                Entry::Undo(expected) | Entry::Redo(expected) => {
                    let before = result.doc.oplog_vv();
                    let changed = if matches!(entry, Entry::Undo(_)) {
                        result.undo.undo()?
                    } else {
                        result.undo.redo()?
                    };
                    assert!(changed);
                    assert_eq!(
                        change_json(&result.doc, &before)?,
                        *expected,
                        "restoration must generate the same operation identities/effects, not only visible text"
                    );
                }
            }
        }
        result.entries.clone_from(&self.entries);
        Ok(result)
    }

    fn check_restart(&self) -> TestResult {
        let recovered = self.recover()?;
        assert_eq!(recovered.doc.get_deep_value_with_id(), self.doc.get_deep_value_with_id());
        assert_eq!(recovered.doc.oplog_vv(), self.doc.oplog_vv());
        assert_eq!(recovered.undo.undo_count(), self.undo.undo_count());
        assert_eq!(recovered.undo.redo_count(), self.undo.redo_count());
        Ok(())
    }
}

#[test]
fn restart_at_every_prefix_preserves_mixed_local_remote_undo_redo_history() -> TestResult {
    let mut a = JournalReplica::new(101)?;
    let b = JournalReplica::new(102)?;
    a.local(Action::Insert { position: 0, text: "a🙂b".into() })?;
    a.local(Action::Insert { position: 2, text: " local".into() })?;
    b.doc.import(&a.doc.export(ExportMode::all_updates())?)?;
    b.doc.get_text("text").insert(0, "remote ")?;
    b.doc.get_map("image").insert("alt", "remote description")?;
    b.doc.commit();
    a.remote(b.doc.export(ExportMode::updates(&a.doc.oplog_vv()))?)?;
    a.local(Action::SetAssetAndWidth)?;
    a.undo()?;
    assert!(a.doc.get_map("image").get("asset").is_none());
    assert!(a.doc.get_map("image").get("alt").is_some());
    let mut recovered = a.recover()?;
    recovered.redo()?;
    a.redo()?;
    assert_eq!(recovered.doc.get_deep_value(), a.doc.get_deep_value());
    recovered.undo()?;
    a.undo()?;
    assert_eq!(recovered.doc.get_deep_value(), a.doc.get_deep_value());
    recovered.undo()?;
    a.undo()?;
    assert_eq!(recovered.doc.get_deep_value(), a.doc.get_deep_value());
    recovered.undo()?;
    a.undo()?;
    assert_eq!(
        recovered.doc.get_deep_value(),
        a.doc.get_deep_value(),
        "recovered undo must match the uninterrupted session"
    );
    assert_eq!(
        a.doc.get_text("text").to_string(),
        "remote ",
        "uninterrupted undo must remove every locally inserted scalar"
    );
    assert_eq!(recovered.doc.get_text("text").to_string(), "remote ");
    assert!(recovered.doc.get_map("image").get("alt").is_some());
    recovered.redo()?;
    recovered.redo()?;
    recovered.redo()?;
    assert_eq!(recovered.doc.get_text("text").to_string(), "remote a🙂 localb");
    Ok(())
}

#[test]
fn restart_keeps_remote_changes_received_while_redo_is_pending() -> TestResult {
    let mut a = JournalReplica::new(201)?;
    let b = JournalReplica::new(202)?;
    a.local(Action::Insert { position: 0, text: "local".into() })?;
    b.doc.import(&a.doc.export(ExportMode::all_updates())?)?;
    a.undo()?;
    b.doc.get_text("text").insert(5, " remote")?;
    b.doc.commit();
    a.remote(b.doc.export(ExportMode::updates(&a.doc.oplog_vv()))?)?;
    assert_eq!(a.doc.get_text("text").to_string(), " remote");
    let mut recovered = a.recover()?;
    recovered.redo()?;
    assert_eq!(recovered.doc.get_text("text").to_string(), "local remote");
    recovered.undo()?;
    assert_eq!(recovered.doc.get_text("text").to_string(), " remote");
    Ok(())
}
