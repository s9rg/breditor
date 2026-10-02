import { describe, expect, it, vi } from "vitest";
import type { Page, TestInfo } from "@playwright/test";
import { attachStartupRejections } from "./attach_startup_rejections";

vi.mock("@playwright/test", async () => ({ expect: (await import("vitest")).expect }));

const modules = Object.fromEntries([
  "wasm_document_json.js", "wasm_engine_bootstrap.js", "wasm_profile_descriptor.js",
  "wasm_selection_adapter.js", "wasm_session_checkpoint.js",
].map(name => [name, {}]));

function fixture(status = "passed") {
  const diagnostic = { format: "breditor/startup-rejections", version: 1, events: [], omitted: 0 };
  const response = { ok: vi.fn(() => true), body: vi.fn(async () => Buffer.from("{}")),
    json: vi.fn(async () => ({ modules })) };
  const page = { evaluate: vi.fn(async () => diagnostic as unknown), request: { get: vi.fn(async () => response) } };
  const info = { config: { configFile: "/repo/playwright.startup-development-diagnostics.config.ts" },
    status, expectedStatus: "passed", attach: vi.fn(async () => {}) };
  return { page, info, response, run: () => attachStartupRejections(page as unknown as Page, info as unknown as TestInfo) };
}

describe("startup rejection evidence attachments", () => {
  it("does not touch ordinary test pages", async () => {
    const f = fixture();
    f.info.config.configFile = "/repo/playwright.config.ts";
    await f.run();
    expect(f.page.evaluate).not.toHaveBeenCalled();
    expect(f.info.attach).not.toHaveBeenCalled();
  });

  it("requires an empty recorder and complete manifest on success", async () => {
    const f = fixture();
    await f.run();
    expect(f.info.attach.mock.calls.map(call => (call as unknown[])[0])).toEqual([
      "startup-rejections.json", "startup-diagnostic-map.json",
    ]);
    f.page.evaluate.mockResolvedValue(null);
    await expect(f.run()).rejects.toThrow();
  });

  it("fails successful tests when instrumentation is missing", async () => {
    const f = fixture();
    f.response.ok.mockReturnValue(false);
    await expect(f.run()).rejects.toThrow();
    f.response.ok.mockReturnValue(true);
    f.response.json.mockResolvedValue({ modules: {} });
    await expect(f.run()).rejects.toThrow();
  });

  it("preserves rejection events from a failed probe", async () => {
    const f = fixture("failed");
    f.page.evaluate.mockResolvedValue({ events: [{ stage: "descriptor:readDescriptor:100" }] });
    await f.run();
    expect(f.info.attach).toHaveBeenCalledWith("startup-rejections.json", {
      body: '{"events":[{"stage":"descriptor:readDescriptor:100"}]}', contentType: "application/json",
    });
  });

  it("does not replace an original failure when the page or attachment fails", async () => {
    const f = fixture("failed");
    f.page.evaluate.mockRejectedValue(new Error("page closed"));
    await expect(f.run()).resolves.toBeUndefined();
    f.info.status = "passed";
    await expect(f.run()).rejects.toThrow("page closed");
  });
});
