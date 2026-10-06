import assert from "node:assert/strict";

/** Browser-dispatched trusted keys, not physical keyboard/IME qualification. */
export async function runNestedListKeyboardProbe(page, url) {
  await page.goto(`${url}/?keyboardProbe=1`);
  await page.waitForFunction(() => document.getElementById("result")?.getAttribute("data-status") === "keyboard-ready", undefined, {timeout: 15000});
  const select = (text, offset) => page.evaluate(({text, offset}) => globalThis.nestedKeyboardProbe.select(text, offset), {text, offset});
  const read = () => page.evaluate(() => globalThis.nestedKeyboardProbe.read());
  await select("Second", 2);
  const original = await read();
  await page.keyboard.press("Tab");
  const indented = await read();
  assert.notEqual(indented.document, original.document);
  assert.equal(indented.active, "editor");
  await page.keyboard.press("Shift+Tab");
  assert.equal((await read()).document, original.document);
  await page.keyboard.press("Tab");
  await page.keyboard.type("!");
  const typed = await read();
  assert.equal(typed.text, "Packed 🙂\nFirst\nSe!cond\nDeep 🙂");
  await page.keyboard.press("Control+z");
  assert.equal((await read()).document, indented.document);
  await page.keyboard.press("Control+Shift+z");
  assert.equal((await read()).document, typed.document);
  await page.keyboard.press("Enter");
  assert.equal((await read()).text, "Packed 🙂\nFirst\nSe!\ncond\nDeep 🙂");
  await page.keyboard.press("Backspace");
  assert.equal((await read()).document, typed.document, "joining the split nested item must restore descendants exactly");
  await select("First", 0);
  await page.keyboard.press("Tab");
  const navigated = await read();
  assert.equal(navigated.active, "after-editor", "disabled indent must allow browser focus navigation");
  assert.equal(navigated.document, typed.document);
  assert.deepEqual(navigated.status, {phase: "live"});
  assert.ok(navigated.keys.length >= 7 && navigated.keys.every(key => key.trusted));
  await page.evaluate(() => globalThis.nestedKeyboardProbe.finish());
  await page.waitForFunction(() => document.getElementById("result")?.getAttribute("data-status") === "passed");
  return {status: "passed", scope: "browser-dispatched trusted keys: Tab/Shift-Tab, typing, Enter/Backspace, history and disabled-indent focus navigation; not physical IME"};
}
