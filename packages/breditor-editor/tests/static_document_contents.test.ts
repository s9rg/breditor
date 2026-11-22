import {describe, expect, it} from "vitest";
import {renderStaticDocument, type StaticRenderOptions} from "../src/static_document.js";
import {el, envelope, f, p, text, type Json} from "./static_document_fixture.js";

const heading = (id: string, level: number, label: string, options: Json = {}) =>
 el("heading", {"block-id": id, level, ...options}, [text(label, [f("breditor/strong")])]);

function render(children: Json[], options: StaticRenderOptions = {tableOfContents: true}): HTMLElement {
 const output = document.createElement("article");
 output.innerHTML = renderStaticDocument(envelope(children), {fragment: true, ...options});
 return output;
}

describe("published document table of contents", () => {
 it("links displayed headings in order, nests skipped ranks, and keeps V4 bookmark links", () => {
  const output = render([
   heading("beginning", 2, "Start <here> & setup"),
   el("blockquote", {"block-id": "quote"}, [heading("quote.child", 4, "Repeated", {bookmark: "sublink"})]),
   heading("tail", 2, "Repeated"),
  ]);
  const nav = output.querySelector("nav")!;
  expect(nav.getAttribute("aria-label")).toBe("Table of contents");
  expect([...nav.querySelectorAll("a")].map(link => link.textContent)).toEqual([
   "Start <here> & setup", "Repeated", "Repeated",
  ]);
  expect(nav.querySelector("ol > li > ol > li a")?.textContent).toBe("Repeated");
  expect(nav.querySelectorAll("strong, img, script")).toHaveLength(0);
  for (const link of nav.querySelectorAll("a")) {
   const target = [...output.querySelectorAll("[id]")].find(element => `#${element.id}` === link.hash);
   expect(target).toBeDefined();
   expect(target?.closest("h2, h4")?.textContent).toBe(link.textContent);
  }
  expect(output.querySelector("#bm-sublink")?.tagName).toBe("H4");
 });

 it("keeps link identity across heading renames and honors explicit view namespaces", () => {
  const options = {tableOfContents: {label: 'Reader "contents"', idPrefix: "preview_a"}, blockIds: false};
  const before = render([heading("beginning", 2, "Before")], options);
  const after = render([heading("beginning", 2, "After")], options);
  expect(before.querySelector("a")?.hash).toBe("#breditor-contents-preview_a~beginning");
  expect(after.querySelector("a")?.hash).toBe(before.querySelector("a")?.hash);
  expect(after.querySelector("nav")?.getAttribute("aria-label")).toBe('Reader "contents"');
  expect(after.querySelector("[data-rich-block]")).toBeNull();
  expect(render([heading("beginning", 2, "Before")], {
   tableOfContents: {idPrefix: "preview_b"},
  }).querySelector("a")?.hash).not.toBe(before.querySelector("a")?.hash);
 });

 it("keeps the default output and omits an empty contents section", () => {
  const prose = [p("body", [text("Body")])];
  expect(render(prose).innerHTML).toBe(render(prose, {}).innerHTML);
  const headingDocument = envelope([heading("title", 2, "Title")]);
  expect(renderStaticDocument(headingDocument, {tableOfContents: false})).toBe(renderStaticDocument(headingDocument));
  expect(() => renderStaticDocument(headingDocument, {tableOfContents: {idPrefix: "unsafe prefix"}})).toThrow(TypeError);
 });

 it("ignores leading whitespace before bounding names and labels blank headings", () => {
  const whitespace = " ".repeat(520);
  const output = render([
   heading("spaced", 2, whitespace + "Release notes"),
   heading("blank", 2, whitespace),
  ]);
  expect([...output.querySelectorAll("nav a")].map(link => link.textContent)).toEqual(["Release notes", "Untitled heading"]);
  expect(output.querySelector("h2")?.textContent).toBe(whitespace + "Release notes");
 });

 it("bounds the navigation list and keeps complete heading text in the body", () => {
  const titles = Array.from({length: 513}, (_, index) => heading(`h-${index}`, 2,
   index === 0 ? "x".repeat(511) + "🌱" : `Heading ${index}`));
  const output = render(titles);
  expect(output.querySelectorAll("nav a")).toHaveLength(512);
  expect(output.querySelector("nav a")?.textContent).toBe("x".repeat(511) + "…");
  expect(output.querySelector("h2")?.textContent).toBe("x".repeat(511) + "🌱");
  expect(output.querySelector('h2[data-rich-text="h-512"]')?.getAttribute("id")).toBeNull();
 });
});
