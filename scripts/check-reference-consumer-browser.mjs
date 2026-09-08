import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

const requestedDirectory = process.argv[2];
assert.equal(
  typeof requestedDirectory,
  "string",
  "usage: node check-reference-consumer-browser.mjs <bundle-directory>",
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
      document.documentElement.dataset["breditorReferencePackageReady"] ===
        "true" ||
      document.documentElement.dataset["breditorReferencePackageError"] !==
        undefined,
    undefined,
    { timeout: 10_000 },
  );
  const outcome = await page.evaluate(() => {
    const smoke = globalThis.__breditorReferencePackageSmoke;
    const highlightButton = [...document.querySelectorAll("#toolbar button")]
      .find((button) => button.textContent === "Highlight");
    return {
      error:
        document.documentElement.dataset["breditorReferencePackageError"],
      ready:
        document.documentElement.dataset["breditorReferencePackageReady"],
      contentEditable: document
        .getElementById("editor")
        ?.getAttribute("contenteditable"),
      markedText: document.querySelector("#editor mark")?.textContent,
      highlightStateId: highlightButton?.getAttribute(
        "data-breditor-state-id",
      ),
      highlightPressed: highlightButton?.getAttribute("aria-pressed"),
      toolbarButtons: document.querySelectorAll("#toolbar button").length,
      documentJson: smoke?.documentJson,
      plainText: smoke?.plainText,
      snapshot: smoke?.snapshot,
      profile: smoke?.profile,
    };
  });

  assert.equal(outcome.error, undefined);
  assert.equal(outcome.ready, "true");
  assert.equal(outcome.contentEditable, "true");
  assert.equal(outcome.markedText, "Reference Highlight");
  assert.equal(outcome.highlightStateId, "example/highlight-control");
  assert.equal(outcome.highlightPressed, "true");
  assert.equal(outcome.toolbarButtons, 4);
  assert.equal(outcome.plainText?.value, "Reference Highlight");
  assert.deepEqual(outcome.snapshot?.status, { phase: "live" });
  assert.equal(outcome.snapshot?.document.revision, "1");
  assert.equal(outcome.profile?.formatKind, "example/highlight");
  assert.equal(
    outcome.profile?.schemaFingerprint,
    "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741",
  );
  assert.equal(
    JSON.parse(outcome.documentJson?.value ?? "null").schemaFingerprint,
    outcome.profile?.schemaFingerprint,
  );

  const disposed = await page.evaluate(() => {
    const smoke = globalThis.__breditorReferencePackageSmoke;
    if (smoke === undefined) throw new Error("missing reference smoke owner");
    return { first: smoke.dispose(), second: smoke.dispose() };
  });
  const expectedDisposal = {
    status: "disposed",
    editorChildren: 0,
    toolbarChildren: 0,
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
  "check-reference-consumer-browser: supported-root tarballs initialized the reference profile in Chromium.",
);

async function serve(rawUrl, response) {
  const pathname = decodeURIComponent(
    new URL(rawUrl ?? "/", "http://local").pathname,
  );
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
