// Opt-in disposable-fixture transforms. Never applied to shipping packages.
import assert from "node:assert/strict";

const counts = {"composition_controller.ts": 17, "wasm_command_adapter.ts": 29, "command_queue.ts": 7};
export function instrumentCompositionModule(source, name) {
  assert.ok(Object.hasOwn(counts, name), "unsupported composition diagnostic module");
  let catches = 0;
  let result = source.replace(/\} catch \{/gu, (match, offset) => {
    catches++;
    const line = source.slice(0, offset).split("\n").length;
    return `} catch (imeDiagnosticError) {\ntry { recordImeDiagnostic(${JSON.stringify(`${name}:${line}:catch`)}, imeDiagnosticError); } catch {}`;
  });
  assert.equal(catches, counts[name], `diagnostic catch sites changed: ${name}`);
  if (name === "composition_controller.ts") {
    const replace = (from, to) => {
      assert.equal(result.split(from).length, 2, `composition diagnostic anchor changed: ${from}`);
      result = result.replace(from, to);
    };
    replace("#quarantine(reason: CompositionAbortReason): CompositionControllerTerminal<P> {",
      "#quarantine(reason: CompositionAbortReason): CompositionControllerTerminal<P> {\ntry { recordImeDiagnostic('composition:quarantine', undefined, {reason, phase: this.#state.phase}); } catch {}");
    replace("if (!commandAccepted) {", "if (!commandAccepted) {\ntry { recordImeDiagnostic('composition:commandNotAccepted', undefined, {candidate: candidate.value.kind, status: submission.result.command.status}); } catch {}");
    replace('if (submission.status !== "completed") {', 'if (submission.status !== "completed") {\ntry { recordImeDiagnostic("composition:submissionNotCompleted", undefined, {status: submission.status, code: submission.status === "failed" ? submission.failure.code : submission.reason}); } catch {}');
    replace("if (!reconciled.ok) return this.#quarantine(\"domReconcileFailed\");",
      "if (!reconciled.ok) { try { recordImeDiagnostic('composition:domReconcileFailed', undefined, {code: reconciled.error.code}); } catch {} return this.#quarantine(\"domReconcileFailed\"); }");
  }
  return result;
}
