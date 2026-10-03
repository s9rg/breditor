import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page, TestInfo } from "@playwright/test";
import { attachConfiguredLinkFaults, attachLinkFaults } from "./attach_link_faults";

vi.mock("@playwright/test", async () => ({ expect: (await import("vitest")).expect }));
afterEach(() => vi.unstubAllEnvs());

function fixture(status = "passed") {
  const diagnostic = { format: "breditor/queue-faults", version: 1, events: [], deliveries: [] };
  const response = {
    ok: vi.fn(() => true),
    body: vi.fn(async () => Buffer.from('{"modules":{}}')),
  };
  const page = {
    evaluate: vi.fn(async () => diagnostic as unknown),
    request: { get: vi.fn(async () => response) },
  };
  const info = {
    config: { configFile: "/repo/playwright.queue-diagnostics.config.ts" },
    status, expectedStatus: "passed",
    attach: vi.fn(async (_name: string, _options: { body: string | Buffer; contentType: string }) => {}),
  };
  return { diagnostic, page, info, response,
    run: () => attachLinkFaults(page as unknown as Page, info as unknown as TestInfo) };
}

describe("queue and delivery evidence attachments", () => {
  it.each([undefined, "/repo/playwright.config.ts", "/repo/not-playwright.queue-diagnostics.config.ts"])(
    "does not touch ordinary browser teardown for %s", async configFile => {
      const f = fixture();
      Object.assign(f.info.config, { configFile });
      await attachConfiguredLinkFaults(f.page as unknown as Page, f.info as unknown as TestInfo);
      expect(f.page.evaluate).not.toHaveBeenCalled();
      expect(f.page.request.get).not.toHaveBeenCalled();
      expect(f.info.attach).not.toHaveBeenCalled();
    });

  it.each(["/repo/playwright.queue-diagnostics.config.ts", "C:\\repo\\playwright.link-diagnostics.config.ts"])(
    "captures evidence for the exact diagnostic configuration %s", async configFile => {
      const f = fixture();
      f.info.config.configFile = configFile;
      await attachConfiguredLinkFaults(f.page as unknown as Page, f.info as unknown as TestInfo);
      expect(f.info.attach.mock.calls.map(([name]) => name)).toEqual(["link-faults.json", "link-diagnostic-map.json"]);
    });

  it("saves the recorder before requesting the map", async () => {
    const f = fixture();
    await f.run();
    expect(f.info.attach.mock.calls.map(([name]) => name)).toEqual([
      "link-faults.json", "link-diagnostic-map.json",
    ]);
    expect(f.info.attach.mock.invocationCallOrder[0]).toBeLessThan(f.page.request.get.mock.invocationCallOrder[0]!);
  });

  it.each(["failed", "timedOut"])("keeps the recorder if the server has stopped after a %s test", async status => {
    const f = fixture(status);
    f.page.request.get.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(f.run()).resolves.toBeUndefined();
    expect(f.info.attach).toHaveBeenCalledExactlyOnceWith("link-faults.json", {
      body: JSON.stringify(f.diagnostic), contentType: "application/json",
    });
  });

  it("still rejects missing map evidence on an otherwise passing test", async () => {
    const f = fixture();
    f.page.request.get.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(f.run()).rejects.toThrow("ECONNREFUSED");
    expect(f.info.attach).toHaveBeenCalledWith("link-faults.json", {
      body: JSON.stringify(f.diagnostic), contentType: "application/json",
    });
  });

  it("retains the recorder if reading the map body fails", async () => {
    const f = fixture("failed");
    f.response.body.mockRejectedValue(new Error("connection closed"));
    await f.run();
    expect(f.info.attach.mock.calls.map(([name]) => name)).toEqual(["link-faults.json"]);
  });

  it("requires the recorder and the opt-in delivery observer", async () => {
    const f = fixture();
    f.page.evaluate.mockResolvedValue(null);
    await expect(f.run()).rejects.toThrow();
    vi.stubEnv("BREDITOR_QUEUE_DELIVERY", "1");
    f.page.evaluate.mockResolvedValue({ events: [] });
    await expect(f.run()).rejects.toThrow();
    f.page.evaluate.mockResolvedValue(f.diagnostic);
    await expect(f.run()).resolves.toBeUndefined();
  });

  it("requires the opt-in projection observer", async () => {
    const f = fixture();
    vi.stubEnv("BREDITOR_QUEUE_PROJECTION", "1");
    await expect(f.run()).rejects.toThrow();
    f.page.evaluate.mockResolvedValue({ ...f.diagnostic, projection: { events: [] } });
    await expect(f.run()).resolves.toBeUndefined();
  });

  it("requires the opt-in clipboard observer", async () => {
    const f = fixture();
    vi.stubEnv("BREDITOR_QUEUE_CLIPBOARD", "1");
    await expect(f.run()).rejects.toThrow();
    f.page.evaluate.mockResolvedValue({ ...f.diagnostic, clipboard: { events: [] } });
    await expect(f.run()).resolves.toBeUndefined();
  });

  it("attaches a non-OK map before rejecting incomplete instrumentation", async () => {
    const f = fixture();
    f.response.ok.mockReturnValue(false);
    await expect(f.run()).rejects.toThrow();
    expect(f.info.attach.mock.calls.map(([name]) => name)).toEqual([
      "link-faults.json", "link-diagnostic-map.json",
    ]);
  });

  it("does not request a map when an ordinary page has no recorder", async () => {
    const f = fixture();
    f.info.config.configFile = "/repo/playwright.config.ts";
    f.page.evaluate.mockResolvedValue(null);
    await f.run();
    expect(f.page.request.get).not.toHaveBeenCalled();
    expect(f.info.attach).not.toHaveBeenCalled();
  });

  it("preserves the original failure if saving an attachment fails", async () => {
    const f = fixture("failed");
    f.info.attach.mockRejectedValue(new Error("attachment unavailable"));
    await expect(f.run()).resolves.toBeUndefined();
    f.info.status = "passed";
    await expect(f.run()).rejects.toThrow("attachment unavailable");
  });
});
