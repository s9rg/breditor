/** Inspect both of the installed optional adapter's supported peer configurations. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isAbsolute} from "node:path";
import {observeInstalledBoundary, verifyRuntimeValueTypes} from "./source-boundary.mjs";

const name = "@breditor/interchange";
const peer = "@breditor/experimental-rich-content";
const portableRoutes = ["./portable-html", "./portable-html-import"];
const portableSpecifiers = portableRoutes.map(route => name + route.slice(1));
const hidden = [`${name}/dist/index.js`, `${name}/dist/docx.js`, `${name}/dist/epub.js`];
const [compiler, mode] = process.argv.slice(2);
assert.ok(compiler && isAbsolute(compiler) && process.argv.length <= 4 &&
  (mode === undefined || mode === "--print" || mode === "--without-rich-peer"),
"Use the absolute TypeScript CLI path and an optional --print or --without-rich-peer");
const withoutPeer = mode === "--without-rich-peer";
const peerRefusals = withoutPeer ? portableSpecifiers : [];
if (withoutPeer) {
  await assert.rejects(import(peer), {code: "ERR_MODULE_NOT_FOUND"});
  for (const specifier of peerRefusals) {
    await assert.rejects(import(specifier), error =>
      error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes(`'${peer}'`));
  }
}
const observed = await observeInstalledBoundary(compiler, [name], hidden, peerRefusals);
if (mode === "--print") {
  console.log(JSON.stringify(observed, null, 2));
} else {
  const expected = JSON.parse(readFileSync(new URL("interchange-source-boundary.json", import.meta.url), "utf8"));
  if (withoutPeer) for (const route of portableRoutes) delete expected[name][route];
  assert.deepEqual(observed, expected,
    "Installed interchange routes, runtime names or type-only exports changed. Review the compatibility boundary with the API change.");
  const routes = verifyRuntimeValueTypes(observed, compiler);
  const typeOnlyNames = Object.values(observed[name]).reduce((total, entry) => total + entry.typeOnly.length, 0);
  console.log(JSON.stringify({routes, typeOnlyNames, hiddenPathRefusals: hidden.length, peerRefusals,
    runtimeTypeNamesMatch: true, typeOnlyNamesMatch: true}));
}
