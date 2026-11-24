import { afterEach, describe, expect, it, vi } from "vitest";
import { RichAiHighlightOverlay } from "../../breditor-experimental-rich-content/src/language_overlay.js";
import { RichSearchOverlay } from "../../breditor-experimental-rich-content/src/search_overlay.js";
import type { RichSearchHost } from "../../breditor-experimental-rich-content/src/search_host.js";

const fixture = (root: Document | ShadowRoot = document) => {
  const fullscreen = document.createElement("main");
  const surface = document.createElement("div");
  surface.contentEditable = "true";
  surface.textContent = "Editable text";
  fullscreen.append(surface);
  (root instanceof Document ? root.body : root).append(fullscreen);
  const state = { revision: "1", closed: false, busy: false, composing: false, readOnly: false };
  const host: RichSearchHost = {
    surface,
    searchState: () => ({ ...state, available: true, canReplace: true }),
    subscribeSearch: vi.fn(),
    findText: vi.fn(),
    checkSearchResults: vi.fn(),
    selectSearchMatch: vi.fn(),
    replaceSearchOne: vi.fn(),
    replaceSearchAll: vi.fn(),
    focus: vi.fn(),
  };
  return { fullscreen, surface, mount: () => [
    new RichSearchOverlay(host), new RichAiHighlightOverlay(surface, () => state),
  ] as const };
};

let fullscreenElement: Element | null = null;
const original = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
function mockFullscreen() {
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
}
function changeFullscreen(next: Element | null) {
  fullscreenElement = next;
  document.dispatchEvent(new Event("fullscreenchange"));
}

afterEach(() => {
  fullscreenElement = null;
  if (original) Object.defineProperty(document, "fullscreenElement", original);
  else Reflect.deleteProperty(document, "fullscreenElement");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("fullscreen viewport decorations", () => {
  it("reparents search and language layers on enter and exit, outside editable content", () => {
    mockFullscreen();
    const { fullscreen, surface, mount } = fixture();
    const layers = mount();
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(surface.firstChild!, 0, surface.firstChild!, 8);
    const content = surface.innerHTML;
    const foreign = document.createElement("aside");
    document.body.append(foreign);
    try {
      for (const layer of layers) expect(layer.element.parentElement).toBe(document.body);
      changeFullscreen(fullscreen);
      for (const layer of layers) {
        expect(layer.element.parentElement).toBe(fullscreen);
        expect(layer.element.getAttribute("aria-hidden")).toBe("true");
        expect(layer.element.style.pointerEvents).toBe("none");
      }
      changeFullscreen(foreign);
      for (const layer of layers) expect(layer.element.parentElement).toBe(document.body);
      changeFullscreen(surface);
      for (const layer of layers) expect(layer.element.parentElement).toBe(document.body);
      changeFullscreen(null);
      for (const layer of layers) expect(layer.element.parentElement).toBe(document.body);
      expect(surface.innerHTML).toBe(content);
      expect(selection.toString()).toBe("Editable");
    } finally {
      for (const layer of layers) layer.dispose();
    }
    changeFullscreen(fullscreen);
    for (const layer of layers) expect(layer.element.isConnected).toBe(false);
  });

  it("mounts inside an already-fullscreen editor in a closed shadow root", () => {
    mockFullscreen();
    const shadowHost = document.createElement("div");
    document.body.append(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: "closed" });
    const { fullscreen, surface, mount } = fixture(shadow);
    Object.defineProperty(shadow, "fullscreenElement", {
      get: () => fullscreenElement === shadowHost ? fullscreen : null,
    });
    changeFullscreen(shadowHost);
    const layers = mount();
    try {
      for (const layer of layers) {
        expect(layer.element.parentElement).toBe(fullscreen);
        expect(surface.contains(layer.element)).toBe(false);
      }
      changeFullscreen(null);
      for (const layer of layers) expect(layer.element.parentElement).toBe(document.body);
    } finally {
      for (const layer of layers) layer.dispose();
    }
  });
});
