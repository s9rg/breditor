import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

const CONSUMER_TEXT = "Hello 🙂漢\n";
const CONSUMER_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [
          { kind: "text", text: "Hello ", formats: [] },
          {
            kind: "text",
            text: "🙂漢",
            formats: [{ type: "breditor/strong", properties: {} }],
          },
        ],
      },
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

const requestedDirectory = process.argv[2];
assert.equal(
  typeof requestedDirectory,
  "string",
  "usage: node check-consumer-browser.mjs <bundle-directory>",
);
const bundleDirectory = await realpath(resolve(requestedDirectory));
const bundlePrefix = `${bundleDirectory}${sep}`;

const server = createServer((request, response) => {
  void serve(request.url, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
await new Promise((resolveListening, rejectListening) => {
  server.once("error", rejectListening);
  server.listen(0, "127.0.0.1", () => resolveListening(undefined));
});

let browser;
try {
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "load",
    timeout: 10_000,
  });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset["breditorPackageReady"] === "true" ||
      document.documentElement.dataset["breditorPackageError"] !== undefined,
    undefined,
    { timeout: 10_000 },
  );
  const outcome = await page.evaluate(() => {
    const exported = globalThis.__breditorPackageSmoke;
    return {
      error: document.documentElement.dataset["breditorPackageError"],
      ready: document.documentElement.dataset["breditorPackageReady"],
      contentEditable: document
        .getElementById("editor")
        ?.getAttribute("contenteditable"),
      documentJson: exported?.documentJson,
      plainText: exported?.plainText,
      snapshot: exported?.snapshot,
      exportsFrozen: exported?.exportsFrozen,
      strongText: document.querySelector("#editor strong")?.textContent,
      editorText: document.getElementById("editor")?.textContent,
    };
  });
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.ready, "true");
  assert.equal(outcome.contentEditable, "true");
  assert.equal(outcome.exportsFrozen, true);
  assert.equal(outcome.strongText, "🙂漢");
  assert.equal(outcome.editorText, "Hello 🙂漢");
  assert.ok(outcome.snapshot !== undefined, "missing editor snapshot");
  assert.deepEqual(outcome.snapshot.status, { phase: "live" });
  assert.deepEqual(outcome.snapshot.document, {
    lineage: "tarball-consumer",
    revision: "0",
  });
  assert.deepEqual(outcome.documentJson, {
    ok: true,
    format: "documentJson",
    value: CONSUMER_DOCUMENT_JSON,
    utf8Bytes: new TextEncoder().encode(CONSUMER_DOCUMENT_JSON).byteLength,
    snapshot: { lineage: "tarball-consumer", revision: "0" },
  });
  assert.deepEqual(outcome.plainText, {
    ok: true,
    format: "plainText",
    value: CONSUMER_TEXT,
    utf8Bytes: new TextEncoder().encode(CONSUMER_TEXT).byteLength,
    snapshot: { lineage: "tarball-consumer", revision: "0" },
  });
  const disposed = await page.evaluate(() => {
    const smoke = globalThis.__breditorPackageSmoke;
    if (smoke === undefined) throw new Error("missing package smoke owner");
    return { first: smoke.dispose(), second: smoke.dispose() };
  });
  const expectedDisposal = {
    status: { phase: "disposed" },
    snapshotStatus: { phase: "disposed" },
    host: {
      childNodes: 0,
      contenteditable: null,
      role: null,
      label: null,
      multiline: null,
      editorRoot: null,
    },
  };
  assert.deepEqual(disposed.first, expectedDisposal);
  assert.deepEqual(disposed.second, expectedDisposal);
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise((resolveClosed, rejectClosed) => {
      server.close((error) =>
        error === undefined ? resolveClosed(undefined) : rejectClosed(error),
      );
    });
  }
}

console.log(
  "check-consumer-browser: tarball-only production bundle initialized in Chromium.",
);

async function serve(rawUrl, response) {
  const pathname = decodeURIComponent(new URL(rawUrl ?? "/", "http://local").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const lexicalCandidate = resolve(bundleDirectory, relative);
  if (
    lexicalCandidate !== bundleDirectory &&
    !lexicalCandidate.startsWith(bundlePrefix)
  ) {
    response.writeHead(403);
    response.end();
    return;
  }
  let candidate;
  try {
    candidate = await realpath(lexicalCandidate);
  } catch {
    response.writeHead(404);
    response.end();
    return;
  }
  if (candidate !== bundleDirectory && !candidate.startsWith(bundlePrefix)) {
    response.writeHead(403);
    response.end();
    return;
  }
  let body;
  try {
    body = await readFile(candidate);
  } catch {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentType(candidate),
  });
  response.end(body);
}

function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}
