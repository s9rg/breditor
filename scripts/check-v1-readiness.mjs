/** Reviewed V1 capability ledger guard. Read-only; does not run tests or publish. */
import {lstatSync, readdirSync, readFileSync, realpathSync, statSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const auditPath = resolve(repository, "docs/v1-readiness.json");
export const catalogPath = resolve(repository, "docs/v1-catalog-cases.json");
const catalogDirectory = resolve(repository, "docs/v1-catalog-cases");
export const upstreamCatalogPath = resolve(repository, "docs/v1-catalog-upstream.json");
const featureStates = new Set(["implemented", "partial", "missing"]);
const gateStates = new Set(["open", "passed"]);
const upstreamSources = new Map([
  ["tiptap", {repository: "ueberdosis/tiptap-docs", view: "tree", path: "src/content"}],
  ["ckeditor5", {repository: "ckeditor/ckeditor5", view: "blob", path: "docs/features/feature-digest.md"}],
]);
const requiredReleaseGates = [
  "catalog-coverage",
  "distribution",
  "compatibility",
  "release-ci",
  "browser-reliability",
  "accessibility-input-mobile",
  "performance-and-size",
  "public-relay-hardening",
  "storage-lifecycle",
  "dependency-and-license-review",
  "integration-docs-and-support",
  "final-rc",
];
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
  const gates = uniqueRows(audit.gates, "gates");
  for (const id of requiredReleaseGates) {
    requireValue(gates.has(id), `missing required release gate ${id}`);
  }
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

/** Validate versioned case definitions and their references to the grouped audit. */
export function validateCatalogCases(catalog, audit) {
  requireValue(object(catalog) && catalog.format === "breditor/v1-catalog-cases" && catalog.formatVersion === 1,
    "unsupported V1 catalog cases format");
  uniqueRows(catalog.cases, "catalog cases");
  const features = new Set(audit.features.map(row => row.id));
  const sources = new Set(audit.sources.map(row => row.id));
  for (const row of catalog.cases) {
    requireValue(Number.isSafeInteger(row.version) && row.version > 0, `${row.id} needs a positive case version`);
    requireValue(features.has(row.feature), `${row.id} references an unknown feature group`);
    requireValue(Array.isArray(row.sources) && row.sources.length > 0 && new Set(row.sources).size === row.sources.length
      && row.sources.every(id => sources.has(id)), `${row.id} has missing, duplicate or unknown comparison sources`);
    requireValue(text(row.scenario) && Array.isArray(row.expected) && row.expected.length > 0 && row.expected.every(text),
      `${row.id} needs a scenario and expected observations`);
    requireValue(row.untrustedInput === undefined || text(row.untrustedInput), `${row.id} has a blank untrusted-input scenario`);
  }
  return catalog;
}

function supplementalCatalogPaths(directory) {
  let directoryStats;
  try {
    directoryStats = lstatSync(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  requireValue(directoryStats.isDirectory(), "V1 catalog case directory must be a real directory");
  return readdirSync(directory).filter(name => name.endsWith(".json")).sort()
    .map(name => resolve(directory, name));
}

function readCatalogJson(path) {
  requireValue(lstatSync(path).isFile(), `V1 catalog file must be a regular file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readCatalogs(directory = catalogDirectory) {
  return [catalogPath, ...supplementalCatalogPaths(directory)].map(readCatalogJson);
}

/** Completion is a manually reviewed ledger assertion, never an automated test pass. */
export function summarizeAudit(audit, catalogs = readCatalogs()) {
  validateAudit(audit);
  const cases = catalogs.flatMap(catalog => validateCatalogCases(catalog, audit).cases);
  uniqueRows(cases, "combined catalog cases");
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
    preRcLedgerComplete: featureGaps.length === 0 && openGates.every(row => row.id === "final-rc"),
    featureGroups: audit.features.length,
    catalogCasesDefined: cases.length,
    catalogFeatureGroupsWithCases: new Set(cases.map(row => row.feature)).size,
    counts,
    featureGaps: featureGaps.map(({id, summary, status, acceptance}) => ({id, summary, status, acceptance})),
    openGates: openGates.map(({id, summary, acceptance}) => ({id, summary, acceptance})),
  };
}

/** Validate the pinned comparison index and count its case links. */
export function summarizeUpstreamCatalog(index, cases) {
  requireValue(object(index) && index.format === "breditor/v1-catalog-upstream" && index.formatVersion === 1,
    "unsupported V1 upstream catalog format");
  const catalogIds = uniqueRows(index.catalogs, "upstream catalogs");
  requireValue(catalogIds.size === upstreamSources.size && [...upstreamSources.keys()].every(id => catalogIds.has(id)),
    "the V1 upstream index must include both comparison catalogs");
  const caseVersions = new Set(cases.map(row => `${row.id}@${row.version}`));
  return index.catalogs.map(catalog => {
    const {id, commit, source, entries} = catalog;
    requireValue(typeof commit === "string" && /^[0-9a-f]{40}$/.test(commit), `${id} needs a pinned upstream commit`);
    const upstream = upstreamSources.get(id);
    const pinnedSource = `https://github.com/${upstream.repository}/${upstream.view}/${commit}/${upstream.path}`;
    requireValue(source === pinnedSource, `${id} source must link to its pinned upstream commit`);
    requireValue(Array.isArray(entries) && entries.length > 0, `${id} has no upstream entries`);
    const seen = new Set();
    const unmapped = [];
    for (const entry of entries) {
      requireValue(object(entry) && text(entry.id) && text(entry.group), `${id} has an invalid entry`);
      requireValue(!seen.has(entry.id), `${id} has duplicate upstream entry ${entry.id}`);
      seen.add(entry.id);
      requireValue(Array.isArray(entry.cases) && new Set(entry.cases).size === entry.cases.length
        && entry.cases.every(ref => caseVersions.has(ref)), `${id}/${entry.id} has duplicate or unknown case versions`);
      if (entry.cases.length === 0) unmapped.push(entry.id);
    }
    return {id, commit, entries: entries.length, mapped: entries.length - unmapped.length, unmapped};
  });
}

export function main(args, report = console.log, error = console.error) {
  if (args.length === 1 && args[0] === "--help") {
    report("Usage: node scripts/check-v1-readiness.mjs [--json] [--require-ready | --require-pre-rc]\nRead-only reviewed-ledger audit. Does not run tests, certify parity, publish or deploy. --require-ready fails for any remaining feature gap or gate. --require-pre-rc allows only the final-rc gate to remain open.");
    return 0;
  }
  const requireReady = args.includes("--require-ready");
  const requirePreRc = args.includes("--require-pre-rc");
  if ((requireReady && requirePreRc) || new Set(args).size !== args.length ||
      args.some(arg => !["--json", "--require-ready", "--require-pre-rc"].includes(arg))) {
    error("V1 audit: unknown or repeated argument; use --help.");
    return 2;
  }
  try {
    const catalogs = readCatalogs();
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    const summary = summarizeAudit(audit, catalogs);
    const upstream = readCatalogJson(upstreamCatalogPath);
    summary.upstreamCatalogs = summarizeUpstreamCatalog(upstream, catalogs.flatMap(catalog => catalog.cases));
    const approvedCatalog = audit.gates.some(row => row.id === "catalog-coverage" && row.status === "passed");
    requireValue(!approvedCatalog || summary.upstreamCatalogs.every(row => row.unmapped.length === 0),
      "catalog coverage needs case links for every upstream entry");
    if (args.includes("--json")) report(JSON.stringify(summary, null, 2));
    else {
      report(`V1 audit at ${summary.baselineCommit.slice(0, 7)} (${summary.reviewedAt})`);
      report(`${summary.featureGroups} unequal capability groups: ${summary.counts.implemented} implemented slices, ${summary.counts.partial} partial, ${summary.counts.missing} missing. Not a completion percentage.`);
      report(`${summary.catalogCasesDefined} catalog acceptance cases defined across ${summary.catalogFeatureGroupsWithCases} groups.`);
      for (const row of summary.upstreamCatalogs) {
        report(`  ${row.id} ${row.commit.slice(0, 7)}: ${row.mapped}/${row.entries} upstream entries linked to case definitions.`);
      }
      report(`${summary.openGates.length} open qualification gates. No behavioral tests executed.`);
      for (const row of summary.featureGaps) report(`  ${row.status}: ${row.id} — ${row.summary}`);
      for (const row of summary.openGates) report(`  gate: ${row.id} — ${row.summary}`);
      if (requirePreRc && summary.preRcLedgerComplete) {
        report("Reviewed pre-RC ledger complete. Verify exact candidate evidence and record final RC approval separately.");
      } else {
        report(summary.ledgerComplete ? "Reviewed ledger complete; exact RC verification and publication approval are still separate." : "NOT RELEASE READY: feature parity and V1 qualification remain incomplete.");
      }
    }
    return (requireReady && !summary.ledgerComplete) ||
      (requirePreRc && !summary.preRcLedgerComplete) ? 1 : 0;
  } catch (cause) {
    error(`V1 audit invalid: ${cause instanceof Error ? cause.message : "unknown validation error"}`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
