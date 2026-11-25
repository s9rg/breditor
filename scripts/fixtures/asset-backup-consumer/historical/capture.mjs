/** Emit archive bytes from the first producer's actual browser store and codec. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { rolldown } from "rolldown";
import { pixels } from "./pixels.mjs";

const [checkout] = process.argv.slice(2);
assert.ok(checkout && process.argv.length === 3, "usage: capture.mjs <historical checkout>");
const root = resolve(checkout);
const commit = "6575420fd979461aec79a06098aca4339136d3b2";
const verifySource = () => {
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), commit);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), "");
};
verifySource();
const bundle = await rolldown({
  input: resolve(root, "packages/breditor-experimental-rich-content/src/assets/store.ts"),
  platform: "browser",
});
let module;
try {
  const { output } = await bundle.generate({ format: "esm", codeSplitting: false });
  assert.equal(output.length, 1);
  module = output[0].code;
} finally {
  await bundle.close();
}

const origin = "http://localhost:49718";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url === `${origin}/`) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Archive producer</title>" });
    if (url === `${origin}/producer.mjs`) return route.fulfill({ contentType: "text/javascript", body: module });
    return route.abort();
  });
  await page.goto(origin);
  const archive = await page.evaluate(async pixels => {
    const { RichAssetStore } = await import("/producer.mjs");
    const file = value => new Blob([Uint8Array.from(atob(value), c => c.charCodeAt(0))], { type: "image/png" });
    const owner = await RichAssetStore.open("first-raster-archive");
    try {
      const cancelled = await owner.ingest(file(pixels.cancelled));
      await owner.cancel(cancelled.asset);
      await owner.retry(cancelled.asset);
      await owner.cancel(cancelled.asset);
      const failed = await owner.ingest(file(pixels.failed));
      const uploaded = await owner.ingest(file(pixels.uploaded));
      await owner.flush(async info => {
        if (info.asset === uploaded.asset) return "first-producer/receipt";
        if (info.asset === failed.asset) throw Error("expected offline upload failure");
        throw Error("unexpected pending upload");
      });
      await owner.ingest(file(pixels.pending));
      const statuses = (await owner.list()).map(info => info.status).sort();
      if (statuses.join(" ") !== "cancelled failed pending uploaded") throw Error("historical queue state mismatch");
      return [...new Uint8Array(await (await owner.exportBackup()).arrayBuffer())];
    } finally {
      owner.close();
    }
  }, pixels);
  verifySource();
  process.stdout.write(Buffer.from(archive).toString("base64") + "\n");
} finally {
  await browser.close();
}
