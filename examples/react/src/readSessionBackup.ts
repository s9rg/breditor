/** Match the core's 16 MiB checkpoint ingress limit before allocating file text. */
export const MAX_SESSION_BACKUP_FILE_BYTES = 16_777_216;

/** Decode only; Rust owns format, schema, and complete retained-history validation. */
export async function readSessionBackup(file: File): Promise<string> {
  if (file.size < 1 || file.size > MAX_SESSION_BACKUP_FILE_BYTES) {
    throw new Error("backup.invalid_size");
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("backup.invalid_size");
  // Do not silently replace invalid UTF-8 or strip a BOM from canonical bytes.
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
