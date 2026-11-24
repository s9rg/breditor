const counterNames = [
  "opens", "disconnects", "reconnectRequests", "savedReloads", "checkpointDownloads", "verifiedRecoveries", "retiredJournals",
];
const hash = value => typeof value === "string" && value.length === 64 && /^[0-9a-f]{64}$/.test(value) ? value : null;

/** A participant's observations in one browser tab, including its reloads. */
export function openPilotSessionReport(participant, storage) {
  const key = `breditor-pilot-session-report-v1:${participant}`;
  let saved;
  try { saved = JSON.parse(storage.getItem(key)); } catch { /* Keep an in-memory report. */ }
  const previousDate = new Date(typeof saved?.openedAt === "string" ? saved.openedAt : NaN);
  const openedAt = Number.isFinite(previousDate.valueOf()) ? previousDate.toISOString() : new Date().toISOString();
  const counts = Object.fromEntries(counterNames.map(name => {
    const value = saved?.counts?.[name];
    return [name, Number.isSafeInteger(value) && value >= 0 ? value : 0];
  }));
  let downloadedSha256 = hash(saved?.downloadedSha256), recoveredSha256 = hash(saved?.recoveredSha256);

  return Object.freeze({
    record(name, checkpointSha256) {
      if (!Object.hasOwn(counts, name)) throw Error("Unknown pilot observation");
      counts[name] = Math.min(Number.MAX_SAFE_INTEGER, counts[name] + 1);
      if (name === "checkpointDownloads") downloadedSha256 = hash(checkpointSha256);
      if (name === "verifiedRecoveries") recoveredSha256 = hash(checkpointSha256);
      try { storage.setItem(key, JSON.stringify({openedAt, counts, downloadedSha256, recoveredSha256})); }
      catch { /* Reporting stays available for this page. */ }
    },
    snapshot() {
      return {format:"breditor/first-party-pilot-session-report",formatVersion:1,participant,openedAt,
        collectedAt:new Date().toISOString(),browser:navigator.userAgent,counts:{...counts},downloadedSha256,recoveredSha256};
    },
  });
}
