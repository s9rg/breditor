/**
 * Requests a local download of an explicitly exported session checkpoint.
 * Checkpoints contain deleted text and undo/redo history. This does not prove
 * the user saved the file, and it never changes persistence or its CAS token.
 */
export function downloadSessionBackup(checkpointJson: string): boolean {
  let url: string | undefined;
  const anchor = document.createElement("a");
  try {
    const blob = new Blob([checkpointJson], { type: "application/json;charset=utf-8" });
    url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = "breditor-session-backup.json";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    const issuedUrl = url;
    // Allow the browser to begin consuming the object URL before revocation.
    setTimeout(() => URL.revokeObjectURL(issuedUrl), 1_000);
    url = undefined;
    return true;
  } catch {
    return false;
  } finally {
    anchor.remove();
    if (url !== undefined) URL.revokeObjectURL(url);
  }
}
