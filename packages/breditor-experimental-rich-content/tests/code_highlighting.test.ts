// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from "vitest";
import {mountRichCodeHighlighting} from "../src/code_highlighting.js";

class FakeHighlight {
 readonly ranges: Range[];
 constructor(...ranges: Range[]) { this.ranges = ranges; }
}

function surfaceWithCode(): HTMLElement {
 const surface = document.createElement("div");
 surface.innerHTML = '<pre data-rich-text="c" data-language="ts"><code>const x = 1; // note</code></pre>';
 document.body.append(surface);
 return surface;
}

describe("code highlighting mount", () => {
 afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head.querySelectorAll("style").forEach(style => style.remove());
 });

 it("paints without crypto.randomUUID (plain-HTTP pages) and gives each mount distinct names", () => {
  const registry = new Map<string, FakeHighlight>();
  vi.stubGlobal("Highlight", FakeHighlight);
  Object.defineProperty(window, "CSS", {configurable: true, value: {highlights: registry}});
  vi.stubGlobal("crypto", {getRandomValues: crypto.getRandomValues.bind(crypto)});
  expect("randomUUID" in window.crypto).toBe(false);

  const first = mountRichCodeHighlighting(surfaceWithCode());
  const second = mountRichCodeHighlighting(surfaceWithCode());
  expect([first.supported, second.supported]).toEqual([true, true]);
  const names = [...registry.keys()];
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(name => /^breditor-syntax-[a-z0-9]+-\d+-[a-z]+$/.test(name))).toBe(true);
  const prefixes = new Set(names.map(name => name.replace(/-[a-z]+$/, "")));
  expect(prefixes.size).toBe(2);

  first.dispose();
  second.dispose();
  expect(registry.size).toBe(0);
 });

 it("reports unsupported browsers without throwing", () => {
  Object.defineProperty(window, "CSS", {configurable: true, value: {}});
  expect(mountRichCodeHighlighting(surfaceWithCode()).supported).toBe(false);
 });
});
