import { expect, it, vi } from "vitest";
import { snapshotProjectionChild } from "./projection_child_snapshot";

it("distinguishes a frozen success result without inspecting the projection", () => {
  const projection = new Proxy({}, { get() { throw new Error("do not inspect projection"); } });
  expect(snapshotProjectionChild(Object.freeze({ ok: true, value: projection }))).toEqual({
    resultType: "object", frozen: true, okField: "data", okType: "boolean", ok: "true", okJson: "true",
    valueField: "data", errorField: "absent", code: "unknown",
  });
});

it("retains only a closed error code, not error messages or document values", () => {
  const result = snapshotProjectionChild(Object.freeze({ ok: false,
    error: { code: "projection.noncanonical_runs", message: "private document" } }));
  expect(result).toMatchObject({ ok: "false", errorField: "data", valueField: "absent", code: "projection.noncanonical_runs" });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(snapshotProjectionChild({ ok: "private", error: { code: "private" } })).toMatchObject({ ok: "unknown", code: "unknown" });
});

it("does not invoke accessors and contains descriptor-trap exceptions", () => {
  const getter = vi.fn(() => { throw new Error("do not invoke"); });
  const result = Object.defineProperties({}, { ok: { get: getter }, error: { get: getter }, value: { get: getter } });
  expect(snapshotProjectionChild(result)).toMatchObject({ okField: "accessor", ok: "unknown",
    valueField: "accessor", errorField: "accessor" });
  expect(getter).not.toHaveBeenCalled();
  expect(snapshotProjectionChild(new Proxy({}, { getOwnPropertyDescriptor: getter }))).toEqual({ unreadable: true });
});
