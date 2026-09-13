// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionBackupImporter } from "./SessionBackupImporter.js";

const mocks = vi.hoisted(() => ({ read: vi.fn(), editor: vi.fn() }));
vi.mock("./readSessionBackup.js", () => ({ readSessionBackup: mocks.read }));
vi.mock("./BreditorEditor.js", () => ({ BreditorEditor: (props: unknown) => { mocks.editor(props); return null; } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;

async function mount(): Promise<HTMLInputElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<SessionBackupImporter primaryModifier="control" />));
  return container.querySelector("input")!;
}

async function choose(input: HTMLInputElement): Promise<void> {
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["backup"], "session.json")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  mocks.read.mockReset();
  mocks.editor.mockReset();
});

it("keeps a recovered session on cancelled close and only discards after confirmation", async () => {
  mocks.read.mockResolvedValue("validated later by Rust");
  await choose(await mount());
  expect(mocks.editor).toHaveBeenCalledWith({ primaryModifier: "control", label: "Recovered Breditor session", initialSessionCheckpointJson: "validated later by Rust" });
  expect(container.querySelector("input")).toBeNull();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => container.querySelector("button")?.click());
  expect(container.querySelector("input")).toBeNull();
  confirm.mockReturnValue(true);
  await act(async () => container.querySelector("button")?.click());
  expect(container.querySelector("input")).not.toBeNull();
});

it("redacts failed reads and leaves the picker available", async () => {
  mocks.read.mockRejectedValue(new Error("PRIVATE FILE CONTENT"));
  const input = await mount();
  await choose(input);
  expect(container.textContent).toContain("Could not read this backup");
  expect(container.textContent).not.toContain("PRIVATE FILE CONTENT");
  expect(input.disabled).toBe(false);
  expect(mocks.editor).not.toHaveBeenCalled();
});

it("does not mount a late recovery result after the importer unmounts", async () => {
  let resolve!: (value: string) => void;
  mocks.read.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
  const input = await mount();
  await choose(input);
  expect(input.disabled).toBe(true);
  await act(async () => root?.unmount());
  root = undefined;
  await act(async () => resolve("late private backup"));
  expect(mocks.editor).not.toHaveBeenCalled();
});
