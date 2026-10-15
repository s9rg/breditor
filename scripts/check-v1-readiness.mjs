/** Reviewed V1 capability ledger guard. Read-only; does not run tests or publish. */
import {readFileSync, realpathSync, statSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const auditPath = resolve(repository, "docs/v1-readiness.json");
const featureStates = new Set(["implemented", "partial", "missing"]);
const gateStates = new Set(["open", "passed"]);
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const requireValue = (condition, message) => {if (!condition) throw new Error(message);};

function uniqueRows(rows, label) {
  requireValue(Array.isArray(rows) && rows.length > 0, `${label} must be a nonempty array`);
  const seen = new Set();
  for (const row of rows) {
    requireValue(object(row) && typeof row.id === "string" && identifier.test(row.id), `${label} has an invalid ID`);
    requireValue(!seen.has(row.id), `${label} has duplicate ID ${row.id}`);
    seen.add(row.id);
  }
  return seen;
}

function checkEvidence(row) {
  requireValue(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} needs local evidence`);
  const seen = new Set();
  for (const path of row.evidence) {
    requireValue(text(path) && !isAbsolute(path) && !path.includes("\\") && !path.split("/").includes(".."), `${row.id} has a non-repository evidence path`);
    requireValue(!seen.has(path), `${row.id} has duplicate evidence`);
    seen.add(path);
    const file = resolve(repository, path);
    let found = false;
    try {
      const actual = relative(repository, realpathSync(file));
      found = !isAbsolute(actual) && actual !== ".." && !actual.startsWith("../") && statSync(file).isFile();
    } catch { /* Missing evidence remains a validation failure, not a completed gate. */ }
    requireValue(found, `${row.id} evidence file is missing or outside the repository: ${path}`);
  }
}

/** Validate bookkeeping and source references, not the truth of claimed test results. */
export function validateAudit(audit) {
  requireValue(object(audit) && audit.format === "breditor/v1-readiness" && audit.formatVersion === 1, "unsupported V1 audit format");
  requireValue(typeof audit.reviewedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(audit.reviewedAt)
    && Number.isFinite(Date.parse(audit.reviewedAt)) && new Date(audit.reviewedAt).toISOString().slice(0, 10) === audit.reviewedAt, "audit review date must be an exact calendar date");
  requireValue(typeof audit.baselineCommit === "string" && /^[0-9a-f]{40}$/.test(audit.baselineCommit), "audit baseline must be a full commit SHA");
  requireValue(audit.coverage === "grouped-audit-not-exhaustive", "audit coverage must not imply an exhaustive parity certification");
  requireValue(text(audit.target), "audit target is required");
  const sources = uniqueRows(audit.sources, "sources");
  for (const source of audit.sources) {
    let url;
    try {url = new URL(source.url);} catch {throw new Error(`${source.id} needs a valid primary source URL`);}
    requireValue(url.protocol === "https:" && !url.username && !url.password && text(source.note), `${source.id} needs HTTPS and a source note`);
  }
  uniqueRows(audit.features, "features");
  uniqueRows(audit.gates, "gates");
  for (const row of audit.features) {
    requireValue(text(row.area) && text(row.summary) && text(row.current) && text(row.acceptance), `${row.id} needs a current boundary and acceptance condition`);
    requireValue(featureStates.has(row.status), `${row.id} has an unknown feature status`);
    requireValue(Array.isArray(row.sources) && row.sources.length > 0 && new Set(row.sources).size === row.sources.length
      && row.sources.every(id => sources.has(id)), `${row.id} has missing, duplicate or unknown comparison sources`);
    checkEvidence(row);
  }
  for (const row of audit.gates) {
    requireValue(gateStates.has(row.status) && text(row.summary) && text(row.acceptance), `${row.id} needs a valid gate status and acceptance condition`);
    checkEvidence(row);
  }
  return audit;
}

/** Completion is a manually reviewed ledger assertion, never an automated test pass. */
export function summarizeAudit(audit) {
  validateAudit(audit);
  const counts = {implemented: 0, partial: 0, missing: 0};
  for (const row of audit.features) counts[row.status] += 1;
  const featureGaps = audit.features.filter(row => row.status !== "implemented");
  const openGates = audit.gates.filter(row => row.status !== "passed");
  return {
    reviewedAt: audit.reviewedAt,
    baselineCommit: audit.baselineCommit,
    coverage: audit.coverage,
    testsExecuted: false,
    ledgerComplete: featureGaps.length === 0 && openGates.length === 0,
    featureGroups: audit.features.length,
    counts,
    featureGaps: featureGaps.map(({id, summary, status, acceptance}) => ({id, summary, status, acceptance})),
    openGates: openGates.map(({id, summary, acceptance}) => ({id, summary, acceptance})),
  };
}

export function main(args, report = console.log, error = console.error) {
  if (args.length === 1 && args[0] === "--help") {
    report("Usage: node scripts/check-v1-readiness.mjs [--json] [--require-ready]\nRead-only reviewed-ledger audit. Does not run tests, certify parity, publish or deploy. --require-ready fails for any remaining feature gap or gate.");
    return 0;
  }
  if (new Set(args).size !== args.length || args.some(arg => !["--json", "--require-ready"].includes(arg))) {
    error("V1 audit: unknown or repeated argument; use --help.");
    return 2;
  }
  try {
    const summary = summarizeAudit(JSON.parse(readFileSync(auditPath, "utf8")));
    if (args.includes("--json")) report(JSON.stringify(summary, null, 2));
    else {
      report(`V1 audit at ${summary.baselineCommit.slice(0, 7)} (${summary.reviewedAt})`);
      report(`${summary.featureGroups} unequal capability groups: ${summary.counts.implemented} implemented slices, ${summary.counts.partial} partial, ${summary.counts.missing} missing. Not a completion percentage.`);
      report(`${summary.openGates.length} open qualification gates. No behavioral tests executed.`);
      for (const row of summary.featureGaps) report(`  ${row.status}: ${row.id} — ${row.summary}`);
      for (const row of summary.openGates) report(`  gate: ${row.id} — ${row.summary}`);
      report(summary.ledgerComplete ? "Reviewed ledger complete; exact RC verification and publication approval are still separate." : "NOT RELEASE READY: feature parity and V1 qualification remain incomplete.");
    }
    return args.includes("--require-ready") && !summary.ledgerComplete ? 1 : 0;
  } catch (cause) {
    error(`V1 audit invalid: ${cause instanceof Error ? cause.message : "unknown validation error"}`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
