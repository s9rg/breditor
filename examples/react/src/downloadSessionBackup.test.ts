// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { downloadSessionBackup } from "./downloadSessionBackup";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("requests an explicit JSON download and releases its temporary URL and node", async () => {
  vi.useFakeTimers();
  const create = vi.fn((_blob: Blob) => "blob:private-session-backup");
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  let filename: string | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
  expect(downloadSessionBackup('{"text":"💡","history":[]}')).toBe(true);
  expect(filename).toBe("breditor-session-backup.json");
  expect(create).toHaveBeenCalledOnce();
  expect((create.mock.calls[0]?.[0] as Blob).type).toBe("application/json;charset=utf-8");
  expect(document.querySelector("a")).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(revoke).toHaveBeenCalledWith("blob:private-session-backup");
});

it("cleans up immediately if the download cannot be requested", () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: () => "blob:failed-backup", revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("private platform failure"); });
  expect(downloadSessionBackup("private history")).toBe(false);
  expect(document.querySelector("a")).toBeNull();
  expect(revoke).toHaveBeenCalledWith("blob:failed-backup");
});
