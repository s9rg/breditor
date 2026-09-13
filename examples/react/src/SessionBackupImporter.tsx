import { useEffect, useRef, useState, type ReactElement } from "react";
import { BreditorEditor } from "./BreditorEditor.js";
import { readSessionBackup } from "./readSessionBackup.js";

/** Recovery owns a separate, non-persistent editor, never the current saved slot. */
export function SessionBackupImporter({ primaryModifier }: {
  readonly primaryModifier: "control" | "meta";
}): ReactElement {
  const [backup, setBackup] = useState<string>();
  const [reading, setReading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function openFile(file: File): Promise<void> {
    const token = ++request.current;
    setReading(true);
    setFeedback("");
    try {
      const json = await readSessionBackup(file);
      if (request.current !== token) return;
      setBackup(json);
    } catch {
      if (request.current === token) {
        setFeedback("Could not read this backup. Choose a UTF-8 session JSON file up to 16 MiB.");
      }
    } finally {
      if (request.current === token) setReading(false);
    }
  }

  return (
    <section className="demo-panel" aria-label="Session backup recovery">
      <h2>Recover a session backup</h2>
      <p>Open a matching Breditor showcase backup in a separate editor. Your current
        document and saved data stay untouched. Recovery does not autosave: download
        a new backup before closing it. Backups can include deleted text; keep them private.</p>
      {backup === undefined ? (
        <label>
          Open session backup
          <input type="file" accept=".json,application/json" disabled={reading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file !== undefined) void openFile(file);
            }} />
        </label>
      ) : (
        <>
          <BreditorEditor label="Recovered Breditor session" primaryModifier={primaryModifier}
            initialSessionCheckpointJson={backup} />
          <button className="editor-retry" type="button" onClick={() => {
            if (window.confirm("Close the recovered session? Any changes not downloaded as a backup will be lost.")) {
              request.current += 1;
              setBackup(undefined);
              setFeedback("");
            }
          }}>Close recovered session</button>
        </>
      )}
      <p role="status">{reading ? "Reading backup…" : feedback}</p>
    </section>
  );
}
