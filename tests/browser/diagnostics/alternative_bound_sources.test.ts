import { expect, it } from "vitest";
import { createDataViewBound, createJavaScriptBound, createMemoryBoundWasm } from "./alternative_bound_sources";

for (const factory of [createJavaScriptBound, createDataViewBound, createMemoryBoundWasm]) {
  it(`${factory.name} returns independently expected 2048`, () => {
    const bound = factory();
    for (let i = 0; i < 10_000; i++) expect(Object.is(bound(i, 2, 0), 2048)).toBe(true);
  });
}
