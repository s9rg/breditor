import { expect, test } from "@playwright/test";

test("finite binary64 values survive browser return serialization without an editor", async ({ page }) => {
  await page.goto("/selection-endpoint.html");
  const values = [0, 2, 14, 60, 2048];
  const expected = Array.from({ length: 64 }, (_, index) => {
    const value = values[index % values.length]!;
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, value, false);
    return { value, decimal: String(value), bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") };
  });
  for (let batch = 0; batch < 100; batch++) {
    // No editor, Wasm, input event, application adapter, or numeric argument
    // transport. Compare the returned number with separately encoded strings.
    const result = await page.evaluate(() => {
      const source = new Float64Array([0, 2, 14, 60, 2048]);
      const samples = [];
      for (let index = 0; index < 64; index++) {
        const value = source[index % source.length]!;
        const bits = new DataView(new ArrayBuffer(8));
        bits.setFloat64(0, value, false);
        samples.push({ value, decimal: String(value), bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") });
      }
      return samples;
    });
    expect(result, `numeric return batch ${batch}`).toEqual(expected);
  }
});
