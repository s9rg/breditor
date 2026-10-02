/* Standalone jsc only. No DOM shim, module loader, editor, Rust or Wasm.
 * Usage: jsc --useJIT=false jsc_minimal_object_is.js -- [single|tuple]
 * Inspect JSON outcome; this shell's quit() does not convey failure status.
 */
const mode = arguments[0] ?? "single";
if (arguments.length > 1 || !["single", "tuple"].includes(mode)) throw new Error("Expected single or tuple");
(async () => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, 2048, true);
  const initialOptions = jscOptions();
  const expected = [["string", undefined, undefined, 1, 2048],
    ["boolean", undefined, undefined, undefined, undefined]];
  function check(values, expectedValues, iteration) {
    let mask = 0;
    for (let field = 0; field < values.length; ++field) {
      if (!Object.is(values[field], expectedValues[field])) mask |= 1 << field;
    }
    if (mask) {
      print(JSON.stringify({ outcome: "failed", mode, iteration, mask,
        actual: values[4], expected: expectedValues[4],
        recheck: Object.is(values[4], expectedValues[4]), strictRecheck: values[4] === expectedValues[4],
        useJIT: initialOptions.useJIT, finalUseJIT: jscOptions().useJIT }));
      quit();
    }
  }
  for (let iteration = 0; iteration < 10000; ++iteration) {
    if (mode === "tuple") {
      check(["string", undefined, undefined, 1, view.getFloat64(0, true)], expected[0], iteration);
      check(["boolean", undefined, undefined, undefined, undefined], expected[1], iteration);
    } else {
      const actual = view.getFloat64(0, true);
      const equal = Object.is(actual, 2048);
      if (!equal) {
        print(JSON.stringify({ outcome: "failed", mode, iteration, actual,
          expected: 2048, recheck: Object.is(actual, 2048), strictRecheck: actual === 2048,
          useJIT: initialOptions.useJIT, finalUseJIT: jscOptions().useJIT }));
        quit();
      }
    }
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 4));
  }
  print(JSON.stringify({ outcome: "passed", mode, iterations: 10000,
    useJIT: initialOptions.useJIT, finalUseJIT: jscOptions().useJIT }));
  quit();
})().catch(error => { print(JSON.stringify({ outcome: "error", error: String(error) })); quit(); });
