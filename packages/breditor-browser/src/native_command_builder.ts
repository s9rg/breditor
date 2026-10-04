import {
  browserInputActionIds, flatListBrowserInputActionIds,
  canonicalEditorCommandRequest, canonicalFlatListEditorCommandRequest,
  type EditorCommandRequest, type FlatListEditorCommandRequest,
  type EditorDeliveryToken, type FlatListEditorDeliveryToken,
  type EditorSelectionSync, type FlatListEditorSelectionSync,
  type EditorCommandSource, type EngineCommand, type EditorCommandRequirements,
} from "./editor_command.js";

/** Shared native syntax mapping; mode remains explicit at each public entry. @internal */
export type NativeCommandRequest = EditorCommandRequest | FlatListEditorCommandRequest;
export type NativeDeliveryToken = EditorDeliveryToken | FlatListEditorDeliveryToken;
export type NativeSelectionSync = EditorSelectionSync | FlatListEditorSelectionSync;

/** Bound request construction without inventing a legacy token for list input. */
export function nativeCommandBuilder(flatLists: boolean, delivery: NativeDeliveryToken, selection: NativeSelectionSync) {
  return {
    actionIds: () => flatLists ? flatListBrowserInputActionIds(delivery as FlatListEditorDeliveryToken)
      : browserInputActionIds(delivery as EditorDeliveryToken),
    request(source: EditorCommandSource, command: EngineCommand,
      history: EditorCommandRequirements["history"] = command.kind === "history" ? "closeBefore" : "preserve"): NativeCommandRequest {
      // Admission snapshots all caller-owned fields through the established
      // canonicalizer. A base/list mismatch never changes mode implicitly.
      const kind = Object.getOwnPropertyDescriptor(selection, "kind");
      const candidate = {delivery, selection, source, command,
        requirements: {selection: kind !== undefined && "value" in kind && kind.value === "preserve" ? "preserve" : "synchronize", history}};
      const request = flatLists ? canonicalFlatListEditorCommandRequest(candidate) : canonicalEditorCommandRequest(candidate);
      if (request === null) throw new TypeError("native command request is invalid");
      return request;
    },
  };
}
