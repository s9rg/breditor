import { expect, it, vi } from "vitest";
import { snapshotRequiredProperty } from "./required_property_snapshot";

it("distinguishes missing and already-accepted required properties without retaining their values", () => {
  const supplied = [{ name: "example/href", value: "private URL" }, { name: "example/open-in-new-window", value: false }];
  const contract = { properties: supplied.map(({ name }) => ({ name, presence: "required" })) };
  const snapshot = snapshotRequiredProperty("example/link", 1, contract, { values: supplied }, supplied.slice(0, 1));
  expect(snapshot).toMatchObject({ format: "example/link", contractIndex: { decimal: "1", bits: "3ff0000000000000" },
    contract: { length: { decimal: "2" } }, supplied: { length: { decimal: "2" } }, accepted: { length: { decimal: "1" } } });
  expect(JSON.stringify(snapshot)).not.toContain("private");
  expect(snapshotRequiredProperty("private format", 2, contract, { values: supplied }, supplied))
    .toMatchObject({ format: "unknown", accepted: { length: { decimal: "2" } } });
});

it("does not invoke getters, bounds arrays, and contains descriptor traps", () => {
  const get = vi.fn(() => { throw new Error("getter called"); });
  const contract = Object.defineProperty({}, "properties", { get });
  const item = Object.defineProperties({}, { name: { get }, value: { get } });
  expect(snapshotRequiredProperty("example/link", 0, contract, { values: [item] }, []))
    .toMatchObject({ supplied: { items: [{ name: "unknown", valueType: "undefined" }] } });
  expect(get).not.toHaveBeenCalled();
  expect(snapshotRequiredProperty("example/link", 0, {}, { values: new Array(33) }, []))
    .toMatchObject({ supplied: { items: [] } });
  expect(snapshotRequiredProperty("example/link", 0, new Proxy({}, { getOwnPropertyDescriptor: get }), {}, []))
    .toEqual({ unreadable: true });
});
