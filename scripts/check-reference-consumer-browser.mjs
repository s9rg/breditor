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
      fixturesFrozen: smoke?.fixturesFrozen,
      formatting: smoke?.formatting,
      formattingContentEditable: document
        .getElementById("formatting-editor")
        ?.getAttribute("contenteditable"),
      formattingToolbarButtons: document.querySelectorAll(
        "#formatting-toolbar > [data-breditor-toolbar-root] > button",
      ).length,
      formattingDom: (() => {
        const anchor = document.querySelector(
          "#formatting-editor > p > a.breditor-link",
        );
        return {
          attributes: anchor ? [...anchor.getAttributeNames()].sort() : [],
          className: anchor?.getAttribute("class"),
          href: anchor?.getAttribute("href"),
          rel: anchor?.getAttribute("rel"),
          target: anchor?.getAttribute("target"),
          markedText: anchor?.querySelector(
            "mark.breditor-reference-highlight",
          )?.textContent,
        };
      })(),
      showcase: smoke?.showcase,
      showcaseContentEditable: document
        .getElementById("showcase-editor")
        ?.getAttribute("contenteditable"),
      showcaseToolbarButtons: document.querySelectorAll(
        "#showcase-toolbar > [data-breditor-toolbar-root] > button",
      ).length,
      showcaseToolbarLabels: [
        ...document.querySelectorAll(
          "#showcase-toolbar > [data-breditor-toolbar-root] > button",
        ),
      ].map((button) => button.textContent),
      showcaseCurrentDom: (() => {
        const anchor = document.querySelector(
          "#showcase-editor > p > a.breditor-link",
        );
        const leaf = document.querySelector(
          "#showcase-editor > p > a.breditor-link > strong > em > mark.breditor-reference-highlight > s > code",
        );
        return {
          attributes: anchor ? [...anchor.getAttributeNames()].sort() : [],
          className: anchor?.getAttribute("class"),
          href: anchor?.getAttribute("href"),
          rel: anchor?.getAttribute("rel"),
          target: anchor?.getAttribute("target"),
          leafText: leaf?.textContent,
        };
      })(),
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
  assert.equal(outcome.fixturesFrozen, true);

  assert.equal(outcome.formattingContentEditable, "true");
  assert.equal(outcome.formattingToolbarButtons, 5);
  assert.deepEqual(outcome.formattingDom.attributes, [
    "class",
    "href",
    "rel",
    "target",
  ]);
  assert.equal(outcome.formattingDom.className, "breditor-link");
  assert.equal(
    outcome.formattingDom.href,
    "https://example.test/reference/path?source=tarball#proof",
  );
  assert.equal(outcome.formattingDom.rel, "noopener noreferrer");
  assert.equal(outcome.formattingDom.target, "_blank");
  assert.equal(outcome.formattingDom.markedText, "Combined Highlight and Link");
  assert.equal(outcome.formatting?.firstSet.status, "committed");
  assert.equal(
    outcome.formatting?.firstSet.intentId,
    "example/set-link-intent",
  );
  assert.equal(outcome.formatting?.remove.status, "committed");
  assert.equal(outcome.formatting?.remove.intentId, "example/set-link-intent");
  assert.equal(outcome.formatting?.removedAnchor, true);
  assert.equal(outcome.formatting?.finalSet.status, "committed");
  assert.equal(
    outcome.formatting?.finalSet.intentId,
    "example/set-link-intent",
  );
  assert.deepEqual(outcome.formatting?.firstSetDom, outcome.formatting?.finalDom);
  assert.equal(
    outcome.formatting?.finalDom.href,
    outcome.formatting?.canonicalHref,
  );
  assert.notEqual(
    outcome.formatting?.sourceHref,
    outcome.formatting?.canonicalHref,
  );
  assert.equal(outcome.formatting?.profile.bootstrapFormatVersion, 2);
  assert.equal(outcome.formatting?.profile.linkFormatKind, "example/link");
  assert.equal(
    outcome.formatting?.profile.linkIntentId,
    "example/set-link-intent",
  );
  assert.equal(
    outcome.formatting?.profile.schemaFingerprint,
    "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc",
  );
  assert.equal(
    outcome.formatting?.plainText.value,
    "Combined Highlight and Link",
  );
  const formattingDocument = JSON.parse(
    outcome.formatting?.documentJson.value ?? "null",
  );
  assert.equal(
    formattingDocument.schemaFingerprint,
    outcome.formatting?.profile.schemaFingerprint,
  );
  assert.deepEqual(formattingDocument.root.children[0].children[0].formats, [
    { type: "example/highlight", properties: {} },
    {
      type: "example/link",
      properties: {
        "example/href": outcome.formatting?.sourceHref,
        "example/open-in-new-window": true,
      },
    },
  ]);

  const expectedShowcaseToolbar = [
    "Bold",
    "Italic",
    "Strikethrough",
    "Code",
    "Highlight",
    "Link",
    "Undo",
    "Redo",
  ];
  assert.equal(outcome.showcaseContentEditable, "true");
  assert.equal(outcome.showcaseToolbarButtons, 8);
  assert.deepEqual(outcome.showcaseToolbarLabels, expectedShowcaseToolbar);
  assert.deepEqual(
    outcome.showcase?.manifestToolbarOrder,
    expectedShowcaseToolbar,
  );
  assert.deepEqual(
    outcome.showcase?.observedToolbarOrder,
    expectedShowcaseToolbar,
  );
  assert.equal(outcome.showcase?.text, "Breditor showcase");
  assert.equal(outcome.showcase?.maximumDocumentTextUtf8, 1_048_576);
  assert.equal(outcome.showcase?.profile.bootstrapFormatVersion, 2);
  assert.equal(outcome.showcase?.profile.schemaName, "example/showcase-editor");
  assert.equal(outcome.showcase?.profile.schemaVersion, 1);
  assert.equal(
    outcome.showcase?.profile.schemaFingerprint,
    "sha256:2a90a5fea97e6f4c3b9c535a78b76e9daf50afd95df3e3119392bfc19fd5ec63",
  );
  assert.equal(
    outcome.showcase?.profile.emphasisIntentId,
    "example/toggle-emphasis-intent",
  );
  assert.equal(
    outcome.showcase?.profile.strikethroughIntentId,
    "example/toggle-strikethrough-intent",
  );
  assert.equal(
    outcome.showcase?.profile.codeIntentId,
    "example/toggle-code-intent",
  );
  assert.deepEqual(outcome.showcase?.renderManifestKinds, [
    "breditor/strong",
    "example/code",
    "example/emphasis",
    "example/highlight",
    "example/link",
    "example/strikethrough",
  ]);

  const initialShowcaseDocument = JSON.parse(
    outcome.showcase?.initialDocumentJson ?? "null",
  );
  assert.equal(
    initialShowcaseDocument.schemaFingerprint,
    outcome.showcase?.profile.schemaFingerprint,
  );
  assert.deepEqual(
    initialShowcaseDocument.root.children[0].children[0].formats,
    [
      { type: "example/highlight", properties: {} },
      {
        type: "example/link",
        properties: {
          "example/href": "https://example.test/reference",
          "example/open-in-new-window": true,
        },
      },
    ],
  );
  const emptyShowcaseDocument = JSON.parse(
    outcome.showcase?.emptyDocumentJson ?? "null",
  );
  assert.equal(
    emptyShowcaseDocument.schemaFingerprint,
    outcome.showcase?.profile.schemaFingerprint,
  );
  assert.deepEqual(
    emptyShowcaseDocument.root.children[0].children,
    [],
  );
  const generatedShowcaseDocument = JSON.parse(
    outcome.showcase?.generatedDocumentJson ?? "null",
  );
  assert.equal(
    generatedShowcaseDocument.root.children[0].children[0].text,
    "Package-root Showcase helper",
  );
  assert.deepEqual(
    generatedShowcaseDocument.root.children[0].children[0].formats,
    [{ type: "example/emphasis", properties: {} }],
  );
  assert.deepEqual(outcome.showcase?.initialButtons, [
    {
      label: "Bold",
      stateId: "breditor/control-bold",
      disabled: "false",
      pressed: "false",
    },
    {
      label: "Italic",
      stateId: "example/emphasis-control",
      disabled: "false",
      pressed: "false",
    },
    {
      label: "Strikethrough",
      stateId: "example/strikethrough-control",
      disabled: "false",
      pressed: "false",
    },
    {
      label: "Code",
      stateId: "example/code-control",
      disabled: "false",
      pressed: "false",
    },
    {
      label: "Highlight",
      stateId: "example/highlight-control",
      disabled: "false",
      pressed: "true",
    },
  ]);
  assert.deepEqual(
    outcome.showcase?.toggledButtons.map((button) => ({
      label: button.label,
      disabled: button.disabled,
      pressed: button.pressed,
    })),
    ["Bold", "Italic", "Strikethrough", "Code", "Highlight"].map(
      (label) => ({ label, disabled: "false", pressed: "true" }),
    ),
  );
  assert.deepEqual(outcome.showcase?.initialDom.chain, ["a", "mark"]);
  assert.deepEqual(outcome.showcase?.initialDom.anchor.attributes, [
    "class",
    "href",
    "rel",
    "target",
  ]);
  assert.equal(
    outcome.showcase?.initialDom.anchor.className,
    "breditor-link",
  );
  assert.equal(
    outcome.showcase?.initialDom.anchor.href,
    "https://example.test/reference",
  );
  assert.equal(outcome.showcase?.initialDom.anchor.rel, "noopener noreferrer");
  assert.equal(outcome.showcase?.initialDom.anchor.target, "_blank");
  assert.equal(outcome.showcase?.initialDom.text, "Breditor showcase");
  const completeShowcaseChain = [
    "a",
    "strong",
    "em",
    "mark",
    "s",
    "code",
  ];
  assert.deepEqual(outcome.showcase?.toggledDom.chain, completeShowcaseChain);
  assert.deepEqual(outcome.showcase?.undoDom.chain, [
    "a",
    "strong",
    "em",
    "mark",
    "s",
  ]);
  assert.deepEqual(outcome.showcase?.redoDom.chain, completeShowcaseChain);
  assert.deepEqual(outcome.showcaseCurrentDom, {
    attributes: ["class", "href", "rel", "target"],
    className: "breditor-link",
    href: "https://example.test/reference",
    rel: "noopener noreferrer",
    target: "_blank",
    leafText: "Breditor showcase",
  });
  assert.equal(outcome.showcase?.plainText.value, "Breditor showcase");
  assert.deepEqual(outcome.showcase?.snapshot.status, { phase: "live" });
  const showcaseDocument = JSON.parse(
    outcome.showcase?.documentJson.value ?? "null",
  );
  assert.equal(
    showcaseDocument.schemaFingerprint,
    outcome.showcase?.profile.schemaFingerprint,
  );
  assert.deepEqual(showcaseDocument.root.children[0].children[0].formats, [
    { type: "breditor/strong", properties: {} },
    { type: "example/code", properties: {} },
    { type: "example/emphasis", properties: {} },
    { type: "example/highlight", properties: {} },
    {
      type: "example/link",
      properties: {
        "example/href": "https://example.test/reference",
        "example/open-in-new-window": true,
      },
    },
    { type: "example/strikethrough", properties: {} },
  ]);

  const nativeForm = await page.evaluate(() => {
    const toolbar = document.getElementById("formatting-toolbar");
    const editor = document.getElementById("formatting-editor");
    const launcher = [...(toolbar?.querySelectorAll(
      ":scope > [data-breditor-toolbar-root] > button",
    ) ?? [])].find((button) => button.textContent === "Link");
    if (!(launcher instanceof HTMLButtonElement)) {
      throw new Error("native Link launcher is unavailable");
    }
    launcher.click();
    const form = toolbar?.querySelector("form[data-breditor-toolbar-panel]");
    const url = form?.querySelector('input[type="text"][inputmode="url"]');
    const newWindow = form?.querySelector('input[type="checkbox"]');
    const apply = [...(form?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Apply Link",
    );
    if (
      !(form instanceof HTMLFormElement) ||
      !(url instanceof HTMLInputElement) ||
      !(newWindow instanceof HTMLInputElement) ||
      !(apply instanceof HTMLButtonElement)
    ) {
      throw new Error("native Link form is unavailable");
    }
    url.value = "https://example.test/native-form-proof";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    newWindow.checked = false;
    newWindow.dispatchEvent(new Event("change", { bubbles: true }));
    apply.click();
    const anchor = editor?.querySelector("a.breditor-link");
    return {
      formHidden: form.hidden,
      noValidate: form.noValidate,
      urlRequired: url.required,
      feedback: form.querySelector(
        "[data-breditor-toolbar-form-feedback]",
      )?.textContent,
      href: anchor?.getAttribute("href"),
      rel: anchor?.getAttribute("rel"),
      target: anchor?.getAttribute("target"),
      text: anchor?.textContent,
    };
  });
  assert.deepEqual(nativeForm, {
    formHidden: false,
    noValidate: true,
    urlRequired: true,
    feedback: "Link applied.",
    href: "https://example.test/native-form-proof",
    rel: null,
    target: null,
    text: "Combined Highlight and Link",
  });

  const disposed = await page.evaluate(() => {
    const smoke = globalThis.__breditorReferencePackageSmoke;
    if (smoke === undefined) throw new Error("missing reference smoke owner");
    return { first: smoke.dispose(), second: smoke.dispose() };
  });
  const expectedDisposal = {
    status: "disposed",
    formattingStatus: "disposed",
    showcaseStatus: "disposed",
    editorChildren: 0,
    toolbarChildren: 0,
    formattingEditorChildren: 0,
    formattingToolbarChildren: 0,
    showcaseEditorChildren: 0,
    showcaseToolbarChildren: 0,
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
  "check-reference-consumer-browser: supported-root tarballs initialized legacy Highlight, combined typed-Link, and eight-control Showcase profiles in Chromium.",
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
