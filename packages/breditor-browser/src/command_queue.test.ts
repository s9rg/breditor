import { describe, expect, it } from "vitest";

import { BaseDocumentProjection } from "./projection.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import { BaseRangeSelection } from "./selection.js";
import {
  issueEditorDeliveryToken,
  noInputActionRequest,
  rangeSelectionSync,
  type EditorCommandRequest,
} from "./editor_command.js";
import { BreditorCommandQueue } from "./command_queue.js";

function request(detail: string): EditorCommandRequest {
  const projection = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "queue-tests", revision: "0" },
    paragraphs: [{ runs: [] }],
  });
  if (!projection.ok) throw new Error("projection fixture failed");
  const rendered = new BreditorDomRenderer().render(document.createElement("div"), projection.value);
  if (!rendered.ok) throw new Error("render fixture failed");
  const token = issueEditorDeliveryToken(
    projection.value,
    rendered.value.rendered,
    0n,
    Symbol("queue-tests"),
  );
  const selection = BaseRangeSelection.create(projection.value, {
    kind: "range",
    anchor: {
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    },
    focus: {
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    },
  });
  if (!selection.ok) throw new Error("selection fixture failed");
  return noInputActionRequest(
    token,
    rangeSelectionSync(selection.value),
    { kind: "api", detail },
    "breditor/delete-backward",
  );
}

describe("BreditorCommandQueue", () => {
  it("appends reentrant work and delivers it FIFO without recursive execution", () => {
    const calls: string[] = [];
    const depths: number[] = [];
    let depth = 0;
    let nestedStatus = "";
    let queue: BreditorCommandQueue<string>;
    queue = new BreditorCommandQueue((item) => {
      depth += 1;
      depths.push(depth);
      calls.push(item.source.detail);
      if (item.source.detail === "first") {
        nestedStatus = queue.submit(request("second")).status;
        queue.submit(request("third"));
      }
      depth -= 1;
      return item.source.detail;
    });

    const result = queue.submit(request("first"));
    expect(result).toEqual({ status: "completed", sequence: 1n, result: "first" });
    expect(nestedStatus).toBe("queued");
    expect(calls).toEqual(["first", "second", "third"]);
    expect(depths).toEqual([1, 1, 1]);
  });

  it("counts the active head in capacity and rejects overflow without recursion", () => {
    let nested: unknown;
    let queue: BreditorCommandQueue<void>;
    queue = new BreditorCommandQueue(
      () => {
        nested = queue.submit(request("nested"));
      },
      { capacity: 1 },
    );
    queue.submit(request("head"));
    expect(nested).toEqual({ status: "rejected", reason: "capacity" });
  });

  it("fail-stops and quarantines followers after an uncertain executor throw", () => {
    let queue: BreditorCommandQueue<void>;
    queue = new BreditorCommandQueue((item) => {
      if (item.source.detail === "head") {
        expect(queue.submit(request("follower")).status).toBe("queued");
        throw new Error("unknown publication point");
      }
    });
    const result = queue.submit(request("head"));
    expect(result).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
    expect(queue.pendingCount).toBe(1);
    expect(queue.submit(request("later"))).toEqual({ status: "rejected", reason: "failed" });
    queue.dispose();
    expect(queue.pendingCount).toBe(0);
  });

  it("also fail-stops when delivery notification throws or an executor returns a Promise", () => {
    const observerFailure = new BreditorCommandQueue(() => "done", {
      observer: () => {
        throw new Error("observer failed");
      },
    });
    expect(observerFailure.submit(request("one"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.observer_threw", sequence: 1n },
    });

    const asyncExecutor = new BreditorCommandQueue(
      (() => Promise.resolve("not allowed")) as unknown as () => string,
    );
    expect(asyncExecutor.submit(request("one"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
  });

  it("rejects malformed runtime input and invalid capacity without invoking work", () => {
    let calls = 0;
    const queue = new BreditorCommandQueue(() => {
      calls += 1;
    });
    expect(queue.submit({} as EditorCommandRequest)).toEqual({
      status: "rejected",
      reason: "invalidRequest",
    });
    expect(calls).toBe(0);
    expect(() => new BreditorCommandQueue(() => {}, { capacity: 0 })).toThrow(RangeError);
  });
});
