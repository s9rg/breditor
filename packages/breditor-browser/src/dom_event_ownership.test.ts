import { describe, expect, it, vi } from "vitest";

import { classifyDomEventOwnership } from "./dom_event_ownership.js";

describe("classifyDomEventOwnership", () => {
  it("uses native topology and element facts for a shadowed nested control", () => {
    const host = document.createElement("div");
    const button = document.createElement("button");
    host.append(button);
    document.body.append(host);
    const nodeTypeShadow = vi.fn(() => 3);
    const ownerDocumentShadow = vi.fn(() => document);
    const tagNameShadow = vi.fn(() => "DIV");
    const parentNodeShadow = vi.fn(() => host);
    const containsShadow = vi.fn(() => true);
    const attributeShadow = vi.fn(() => false);
    Object.defineProperties(button, {
      nodeType: { configurable: true, get: nodeTypeShadow },
      ownerDocument: { configurable: true, get: ownerDocumentShadow },
      tagName: { configurable: true, get: tagNameShadow },
      parentNode: { configurable: true, get: parentNodeShadow },
      hasAttribute: { configurable: true, value: attributeShadow },
    });
    Object.defineProperty(host, "contains", {
      configurable: true,
      value: containsShadow,
    });

    expect(classifyDomEventOwnership(host, button)).toBe("nestedControl");
    expect(nodeTypeShadow).not.toHaveBeenCalled();
    expect(ownerDocumentShadow).not.toHaveBeenCalled();
    expect(tagNameShadow).not.toHaveBeenCalled();
    expect(parentNodeShadow).not.toHaveBeenCalled();
    expect(containsShadow).not.toHaveBeenCalled();
    expect(attributeShadow).not.toHaveBeenCalled();
  });

  it("uses the native contenteditable attribute and connection state", () => {
    const host = document.createElement("div");
    const nestedEditor = document.createElement("div");
    nestedEditor.setAttribute("contenteditable", "false");
    host.append(nestedEditor);
    document.body.append(host);
    const attributeShadow = vi.fn(() => false);
    const connectedShadow = vi.fn(() => true);
    Object.defineProperty(nestedEditor, "hasAttribute", {
      configurable: true,
      value: attributeShadow,
    });
    Object.defineProperty(host, "isConnected", {
      configurable: true,
      get: connectedShadow,
    });

    expect(classifyDomEventOwnership(host, nestedEditor)).toBe("nestedControl");
    expect(attributeShadow).not.toHaveBeenCalled();
    expect(connectedShadow).not.toHaveBeenCalled();

    host.remove();
    expect(classifyDomEventOwnership(host, nestedEditor)).toBe("outsideHost");
    expect(connectedShadow).not.toHaveBeenCalled();
  });

  it("invalidates a live host moved into an attached ShadowRoot", () => {
    const host = document.createElement("div");
    const text = document.createTextNode("editor text");
    host.append(text);
    document.body.append(host);
    expect(classifyDomEventOwnership(host, text)).toBe("owned");
    const shadowOwner = document.createElement("section");
    document.body.append(shadowOwner);
    const shadowRoot = shadowOwner.attachShadow({ mode: "open" });

    shadowRoot.append(host);

    expect(host.isConnected).toBe(true);
    expect(classifyDomEventOwnership(host, text)).toBe("invalid");
  });
});
