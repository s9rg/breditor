import assert from "node:assert/strict";

/** Select the complete nested word transport unless a comparison is explicit.
 * This controls only isolated nested builds, never default package features.
 * Diagnostic names retain legacy transport; private flag overrides remain
 * available for reproducing earlier candidates without silently mixing modes.
 */
export function nestedListBuildTransport(env, {diagnosticNames = false} = {}) {
  assert.equal(typeof diagnosticNames, "boolean");
  const flag = (name, fallback) => {
    const supplied = env[name];
    const value = supplied === undefined ? (fallback ? "1" : "0") : supplied;
    assert.ok(["0", "1"].includes(value), `${name} must be 0 or 1`);
    return value === "1";
  };
  const privateScalarWords = flag("BREDITOR_NESTED_WORD_CANDIDATE", !diagnosticNames);
  const privateWordBindings = flag("BREDITOR_NESTED_WORD_BINDINGS", privateScalarWords);
  const privateIntegerWords = flag("BREDITOR_NESTED_INTEGER_WORDS", privateScalarWords);
  assert.ok(!privateScalarWords || !diagnosticNames, "word candidate cannot add diagnostic names");
  assert.ok(!privateWordBindings || privateScalarWords, "word bindings require word candidate");
  assert.ok(!privateIntegerWords || privateScalarWords, "integer words require scalar word candidate");
  return Object.freeze({privateScalarWords, privateWordBindings, privateIntegerWords});
}
