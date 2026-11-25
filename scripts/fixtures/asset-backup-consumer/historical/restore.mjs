/** Independently installed reader against recorded first-producer archive bytes. */
import { ASSET_BACKUP_MIME, RichAssetStore, readRichAssetBackup } from "@breditor/editor";
import { pixels } from "./pixels.mjs";

const expectedSha256 = "ff299e7314f19cf63a8c6cd96678fa73743089ee4cb92646145a52fec963f205";
const decode = base64 => Uint8Array.from(atob(base64), character => character.charCodeAt(0));
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(value => value.toString(16).padStart(2, "0")).join("");
const check = (condition, message) => { if (!condition) throw Error(message); };
const same = (left, right, message) => check(JSON.stringify(left) === JSON.stringify(right), message);

async function refuseRestore(name, backup, options, code) {
  let owner, failure;
  try { owner = await RichAssetStore.restoreBackup(name, backup, options); }
  catch (error) { failure = error; }
  finally { owner?.close(); }
  check(failure?.code === code, `Expected ${code}, received ${failure?.code ?? "acceptance"}`);
  check(!(await indexedDB.databases()).some(database => database.name === name), "Invalid archive created a destination");
}

export async function restoreHistoricalArchive(encoded) {
  const input = decode(encoded);
  const archiveSha256 = await sha(input);
  check(archiveSha256 === expectedSha256, "Historical archive bytes changed");
  const archive = new Blob([input], { type: ASSET_BACKUP_MIME });
  const policies = {
    pending: [0, 0, null, null],
    cancelled: [0, 3, null, null],
    failed: [1, 0, null, "upload_failed"],
    uploaded: [1, 0, "first-producer/receipt", null],
  };
  const reader = await readRichAssetBackup(archive);
  const expected = new Map();
  try {
    const entries = reader.entries();
    check(entries.length === 4, "Expected all four historical asset records");
    for (const [status, base64] of Object.entries(pixels)) {
      const payload = decode(base64), asset = `sha256:${await sha(payload)}`;
      const record = entries.find(entry => entry.asset === asset);
      check(record && record.status === status, `Missing historical ${status} asset`);
      same([record.bytes, record.mime, record.width, record.height], [payload.length, "image/png", 1, 1], "Historical raster metadata changed");
      same([record.attempts, record.epoch, record.storageRef, record.failure], policies[status], "Historical queue metadata changed");
      check(await sha(await reader.blob(asset).arrayBuffer()) === asset.slice(7), "Pure reader altered the raster bytes");
      expected.set(asset, record);
    }
  } finally {
    reader.dispose();
  }

  const prefix = `historical-raster-${crypto.randomUUID()}`;
  await refuseRestore(`${prefix}-policy`, archive, {}, "asset_backup_policy");
  const swapped = input.slice();
  // Replace the last 70-byte PNG with a different valid 70-byte PNG so only identity differs.
  const other = decode(pixels.cancelled);
  swapped.set(other, swapped.length - other.length);
  await refuseRestore(`${prefix}-payload`, new Blob([swapped]), { uploadState: "preserve" }, "asset_backup_integrity");

  const destination = `${prefix}-valid`;
  const owner = await RichAssetStore.restoreBackup(destination, archive, { uploadState: "preserve" });
  try {
    check(await sha(await (await owner.exportBackup()).arrayBuffer()) === archiveSha256, "Restore changed the original archive bytes");
  } finally {
    owner.close();
  }
  const reopened = await RichAssetStore.openRetained(destination);
  try {
    const records = await reopened.list();
    check(records.length === expected.size, "Cold restore changed historical archive membership");
    for (const info of records) {
      const { epoch: _epoch, ...retained } = expected.get(info.asset);
      same(info, retained, "Cold restore changed queue metadata");
      check(await sha(await (await reopened.blob(info.asset)).arrayBuffer()) === info.asset.slice(7), "Cold restore changed raster bytes");
    }
    check(await sha(await (await reopened.exportBackup()).arrayBuffer()) === archiveSha256, "Cold archive changed exact framed bytes or epochs");
  } finally {
    reopened.close();
  }

  return { archiveSha256, assets: expected.size, exactColdArchive: true, policyRefusals: 1, integrityRefusals: 1 };
}
