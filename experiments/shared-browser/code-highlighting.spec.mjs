import {expect, test} from "@playwright/test";

function keywords(page) {
 return page.evaluate(() => [...CSS.highlights]
  .filter(([name]) => name.startsWith("breditor-syntax-") && name.endsWith("-keyword"))
  .flatMap(([, ranges]) => [...ranges].map(range => [
   range.startContainer.parentElement.closest("main").id, range.toString(),
  ]))
  .sort());
}

test("both shared writers derive colors from the same edits and dispose independently", async ({page}) => {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 expect(await page.evaluate(async () => {
  const {mountRichCodeHighlighting} = await import("/rich.js");
  const {structuralFixture, codeBlock} = await import("/structural-fixture.mjs");
  const code = codeBlock("snippet", "const enabled = true;");
  code.properties["breditor/language"] = "js";
  const fixture = structuralFixture(window.sharedTools, {children: [code]});
  const before = [fixture.a.checkpointJson(), fixture.b.checkpointJson()];
  const surfaces = [fixture.da.surface.innerHTML, fixture.db.surface.innerHTML];
  const a = mountRichCodeHighlighting(fixture.da);
  const b = mountRichCodeHighlighting(fixture.db);
  window.syntax = {fixture, a, b};
  return a.supported && b.supported && before[0] === fixture.a.checkpointJson() &&
   before[1] === fixture.b.checkpointJson() && surfaces[0] === fixture.da.surface.innerHTML &&
   surfaces[1] === fixture.db.surface.innerHTML;
 })).toBe(true);
 await expect.poll(() => keywords(page)).toEqual([["a", "const"], ["b", "const"]]);
 const depth = await page.evaluate(async () => {
  const {fixture} = window.syntax;
  const previous = fixture.a.view().undoDepth;
  fixture.a.dispatch({commands: [{kind: "insert_text", data: {block: "snippet", offset: 0, text: "export "}}]});
  await fixture.synchronize();
  return fixture.a.view().undoDepth - previous;
 });
 expect(depth).toBe(1);
 await expect.poll(() => keywords(page)).toEqual([
  ["a", "const"], ["a", "export"], ["b", "const"], ["b", "export"],
 ]);
 await page.evaluate(async () => {
  const {fixture, a} = window.syntax;
  fixture.a.undo();
  await fixture.synchronize();
  a.dispose();
 });
 await expect.poll(() => keywords(page)).toEqual([["b", "const"]]);
 expect(await page.evaluate(() => window.syntax.fixture.errors)).toEqual([]);
});
