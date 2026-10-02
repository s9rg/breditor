import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { instrumentClipboardRoutes } from "./clipboard_route_instrumentation";
import { createClipboardRouteRecorder } from "./clipboard_route_recorder";
const id = "/repo/packages/breditor-browser/dist/browser_event_router.js";

it("inserts one call and otherwise preserves the emitted router byte for byte", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/browser_event_router.js", import.meta.url), "utf8");
  const output = instrumentClipboardRoutes(source, id, "/recorder.js")!;
  expect(output.sites).toHaveLength(1);
  expect(output.code.split("\n").slice(1).join("\n").replace("\n__breditorClipboardRoute(disposition, route);", "")).toBe(source);
  expect(instrumentClipboardRoutes(source, "/other.js", "/recorder.js")).toBeNull();
  expect(() => instrumentClipboardRoutes(output.code, id, "/recorder.js")).toThrow("already installed");
  expect(() => instrumentClipboardRoutes("class Router {}", id, "/recorder.js")).toThrow("Expected one");
});

it("passes the original disposition to the observer and keeps the routing result", () => {
  const output = instrumentClipboardRoutes("class Router { #afterClipboard(disposition, route) { return disposition; } run(value) { return this.#afterClipboard(value, 'paste'); } }", id, "/recorder.js")!;
  const observer = vi.fn();
  const value = Object.freeze({ kind: "handled" });
  const run = new Function("__breditorClipboardRoute", "value", output.code.split("\n").slice(1).join("\n") + "\nreturn new Router().run(value);");
  expect(run(observer, value)).toBe(value);
  expect(observer).toHaveBeenCalledExactlyOnceWith(value, "paste");
});

it("retains only closed tags and never invokes accessors or serializes payloads", () => {
  const getter = vi.fn(() => { throw new Error("must not inspect"); });
  const recorder = createClipboardRouteRecorder();
  recorder.record({ kind: "blocked", operation: "paste", reason: "selectionUnavailable", defaultPrevented: true,
    partial: { clipboard: "untouched", command: "notAttempted", cancellation: "confirmed" },
    get text() { return getter(); }, get sequence() { return getter(); } }, "paste");
  expect(recorder.snapshot().events[0]).toMatchObject({ route: "paste", kind: "blocked",
    reason: "selectionUnavailable", command: "notAttempted", defaultPrevented: "true" });
  recorder.record({ get kind() { return getter(); }, reason: "private content" }, "private content");
  expect(getter).not.toHaveBeenCalled();
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private content");
});

it("keeps the last sixteen routes, counts omissions, and survives observer errors", () => {
  const emit = vi.fn(() => { throw new Error("sink failed"); });
  const recorder = createClipboardRouteRecorder(emit);
  for (let i = 0; i < 20; i++) recorder.record({ kind: "blocked", operation: "paste", reason: "staleBase" }, "paste");
  expect(recorder.snapshot()).toMatchObject({ omitted: 4 });
  expect(recorder.snapshot().events).toHaveLength(16);
  expect(emit).toHaveBeenCalledTimes(16);
  recorder.snapshot().events[0]!.reason = "changed";
  expect(recorder.snapshot().events[0]!.reason).toBe("staleBase");
  expect(() => recorder.record(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("trap"); } }), "paste")).not.toThrow();
});
