// Disposable synthetic-fixture diagnosis only. Never modify installed packages
// or production logging. Retain normal terminal queue semantics after logging.
import assert from "node:assert/strict";

export function instrumentQueueFailures(code) {
  const sites = [];
  const transformed = code.replace(/\}\s+catch \{\n(\s+)((?:const failure = )?this\.#fail\("command_queue\.(executor|observer)_threw", (?:sequence|pending\.sequence)\);)/gu,
    (_, indent, statement, phase) => {
      sites.push(phase);
      return `} catch (queueDiagnosticError) {\n${indent}try { console.error("breditor queue failure: ${phase}", String(queueDiagnosticError).slice(0, 1024)); } catch {}\n${indent}${statement}`;
    });
  assert.deepEqual(sites.sort(), ["executor", "executor", "observer", "observer"], "queue diagnostic catch sites changed");
  return transformed;
}
