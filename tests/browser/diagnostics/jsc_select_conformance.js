/* Standalone native-patch control. Independent expected answers are indexes
 * into distinct SameValue classes, not a second call to Object.is or ==.
 * Mixed tuples preserve literal boxing; DataView separately forces doubles.
 * 17*17*4 numeric pairs + 12*12 nonnumeric pairs = 1300 checks.
 */
const options = () => {
  const value = jscOptions();
  return { useJIT: value.useJIT, useDFGJIT: value.useDFGJIT, useFTLJIT: value.useFTLJIT };
};
const before = options();
const entries = [["nan", NaN], ["negative infinity", -Infinity], ["min int", -2147483648],
  ["negative fraction", -1.5], ["negative one", -1], ["negative subnormal", -Number.MIN_VALUE],
  ["negative zero", -0], ["positive zero", 0], ["subnormal", Number.MIN_VALUE],
  ["one", 1], ["fraction", 1.5], ["2048", 2048], ["max int", 2147483647],
  ["unsigned", 2147483648], ["max safe", Number.MAX_SAFE_INTEGER],
  ["max finite", Number.MAX_VALUE], ["infinity", Infinity]];
const view = new DataView(new ArrayBuffer(8));
let checks = 0;
function check(a, b, expected, context) {
  if (Object.is(a, b) !== expected) {
    print(JSON.stringify({ outcome: "failed", context, checks, initialEngineOptions: before, finalEngineOptions: options() }));
    quit();
  }
  checks++;
}
for (let i = 0; i < entries.length; i++) for (let j = 0; j < entries.length; j++) {
  for (let left = 0; left < 2; left++) for (let right = 0; right < 2; right++) {
    let a = entries[i][1], b = entries[j][1];
    if (left) { view.setFloat64(0, a, false); a = view.getFloat64(0, false); }
    if (right) { view.setFloat64(0, b, false); b = view.getFloat64(0, false); }
    check(a, b, i === j, { i, j, left, right });
  }
}
const others = ["a", "b", true, false, undefined, null, {}, {}, Symbol("same"), Symbol("same"), 1n, 2n];
for (let i = 0; i < others.length; i++) for (let j = 0; j < others.length; j++) {
  check(others[i], others[j], i === j, { otherI: i, otherJ: j });
}
print(JSON.stringify({ outcome: "passed", checks, initialEngineOptions: before, finalEngineOptions: options() }));
