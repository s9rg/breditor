import { expect, it, vi } from "vitest";
import { MAX_SESSION_BACKUP_FILE_BYTES, readSessionBackup } from "./readSessionBackup.js";

it("preserves Unicode and BOM bytes instead of repairing a backup", async () => {
  const json = '{"text":"💡"}';
  expect(await readSessionBackup(new File([json], "backup.json"))).toBe(json);
  expect(await readSessionBackup(new File(["\ufeff", json], "backup.json"))).toBe(`\ufeff${json}`);
});

it("rejects invalid UTF-8 instead of substituting replacement characters", async () => {
  await expect(readSessionBackup(new File([new Uint8Array([0xff])], "backup.json"))).rejects.toThrow();
});

it.each([0, MAX_SESSION_BACKUP_FILE_BYTES + 1])("rejects size %s before reading", async (size) => {
  const arrayBuffer = vi.fn();
  await expect(readSessionBackup({ size, arrayBuffer } as unknown as File)).rejects.toThrow("backup.invalid_size");
  expect(arrayBuffer).not.toHaveBeenCalled();
});

it("rejects a changing file size and contains file-read failures", async () => {
  await expect(readSessionBackup({ size: 1, arrayBuffer: async () => new ArrayBuffer(2) } as File)).rejects.toThrow("backup.invalid_size");
  await expect(readSessionBackup({ size: 1, arrayBuffer: async () => { throw new Error("read failed"); } } as unknown as File)).rejects.toThrow("read failed");
});
