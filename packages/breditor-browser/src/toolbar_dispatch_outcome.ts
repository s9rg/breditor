import type { WasmCommandSequenceOutcome } from "./wasm_command_adapter.js";
import type { ToolbarCommandInvocation } from "./toolbar.js";

/** Correlates the finished target with the captured toolbar invocation. @internal */
export function toolbarSequenceOutcomeDispatchStatus(
  sequence: Pick<WasmCommandSequenceOutcome, "status" | "command">,
  invocation: ToolbarCommandInvocation,
): "completed" | "rejected" | undefined {
  try {
    if (sequence.status !== "delivered") return undefined;
    const outcome = sequence.command;
    const command = invocation.command;
    if (outcome.status === "rejected") {
      if (command.kind === "intentJson") return "rejected";
      return command.kind === "action" || command.kind === "intent"
        ? "completed"
        : undefined;
    }
    if (command.kind === "intentJson") {
      if (outcome.status === "committed") {
        return outcome.eventKind === "intent" &&
          outcome.intentId === command.intentId
          ? "completed"
          : undefined;
      }
      return (outcome.status === "blocked" || outcome.status === "unhandled") &&
        outcome.intentId === command.intentId
        ? "rejected"
        : undefined;
    }
    if (command.kind === "intent") {
      const matches =
        outcome.status === "committed"
          ? outcome.eventKind === "intent" &&
            outcome.intentId === command.intentId
          : (outcome.status === "blocked" || outcome.status === "unhandled") &&
            outcome.intentId === command.intentId;
      return matches ? "completed" : undefined;
    }
    if (command.kind === "history") {
      return outcome.status === "unchanged" ||
        (outcome.status === "committed" &&
          outcome.eventKind === command.operation)
        ? "completed"
        : undefined;
    }
    const matches =
      outcome.status === "disabled"
        ? outcome.actionId === command.actionId
        : outcome.status === "committed" && outcome.eventKind === "action";
    return matches ? "completed" : undefined;
  } catch {
    return undefined;
  }
}
