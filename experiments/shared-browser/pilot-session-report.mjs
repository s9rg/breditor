const counterNames = [
  "opens", "disconnects", "reconnectRequests", "savedReloads", "checkpointDownloads", "verifiedRecoveries", "retiredJournals",
];
const hash = value => typeof value === "string" && value.length === 64 && /^[0-9a-f]{64}$/.test(value) ? value : null;
export const pilotArchiveNames = Object.freeze([
  "@breditor/browser", "@breditor/experimental-rich-content", "@breditor/collaboration", "@breditor/editor",
]);

/** Validate and copy the public identity in a stable order before storing or exporting it. */
export function pilotCandidateIdentity(input) {
  if (input === undefined) return undefined;
  if (!input || Object.keys(input).length !== 3 || !hash(input.frontendSha256) || !hash(input.relaySha256) ||
      !Array.isArray(input.packages) || input.packages.length !== pilotArchiveNames.length) throw Error("Invalid pilot candidate");
  const packages = pilotArchiveNames.map(name => {
    const row = input.packages.find(entry => entry?.name === name);
    if (!row || Object.keys(row).length !== 3 || typeof row.version !== "string" ||
        !/^[0-9][0-9A-Za-z+.-]{0,79}$/u.test(row.version) || !hash(row.sha256)) throw Error("Invalid pilot package identity");
    return Object.freeze({name,version:row.version,sha256:row.sha256});
  });
  return Object.freeze({frontendSha256:input.frontendSha256,relaySha256:input.relaySha256,packages:Object.freeze(packages)});
}

/** A participant's observations in one browser tab, including its reloads. */
export function openPilotSessionReport({participant, endpoint, codeSha256, candidate}, storage) {
  const candidateIdentity = pilotCandidateIdentity(candidate);
  const identity = [endpoint, participant, codeSha256];
  if (candidateIdentity) identity.push(candidateIdentity);
  const key = `breditor-pilot-session-report-v1:${JSON.stringify(identity)}`;
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
        collectedAt:new Date().toISOString(),browser:navigator.userAgent,...(candidateIdentity && {candidate:candidateIdentity}),counts:{...counts},downloadedSha256,recoveredSha256};
    },
  });
}
