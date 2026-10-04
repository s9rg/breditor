// Disposable synthetic-fixture diagnosis only. Never modify installed packages
// or production logging. Retain normal terminal queue semantics after logging.
import assert from "node:assert/strict";

export function instrumentQueueFailures(code) {
  const sites = [];
  const transformed = code.replace(/\}\s+catch \{\n(\s+)((?:const failure = )?this\.#fail\("command_queue\.(executor|observer)_threw", (?:sequence|pending\.sequence)\);)/gu,
    (_, indent, statement, phase) => {
      sites.push(phase);
      // Catch-site capture also sees engine-created exceptions, unlike a
      // constructor proxy. Read message and stack independently: arbitrary
      // thrown values/accessors and even the logger may themselves throw.
      // Only use this with synthetic fixtures; stacks can contain local URLs.
      return `} catch (queueDiagnosticError) {
${indent}let queueDiagnosticMessage = "<unprintable>";
${indent}let queueDiagnosticStack = "<unavailable>";
${indent}try { queueDiagnosticMessage = String(queueDiagnosticError).slice(0, 1024); } catch {}
${indent}try {
${indent}  const stack = queueDiagnosticError?.stack;
${indent}  if (typeof stack === "string") queueDiagnosticStack = stack.slice(0, 4096);
${indent}} catch {}
${indent}try { console.error("breditor queue failure: ${phase}", queueDiagnosticMessage, queueDiagnosticStack); } catch {}
${indent}${statement}`;
    });
  assert.deepEqual(sites.sort(), ["executor", "executor", "observer", "observer"], "queue diagnostic catch sites changed");
  return transformed;
}

// Stress only the disposable fixture's owner loop. Keep all correctness
// assertions, disposal and the yield between owners exactly as written.
export function repeatPerformanceOwners(code, repetitions) {
  assert.ok(Number.isSafeInteger(repetitions) && repetitions >= 3 && repetitions <= 100, "owner repetitions must be 3..100");
  const anchor = "repetition < 3";
  assert.equal(code.split(anchor).length, 2, "performance owner loop changed");
  return code.replace(anchor, `repetition < ${repetitions}`);
}
