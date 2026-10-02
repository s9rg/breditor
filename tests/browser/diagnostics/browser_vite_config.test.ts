import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../vite.browser.config";
import link from "../../../vite.link-diagnostics.config";
import clipboard from "../../../vite.clipboard-boundary.config";

describe("ordinary browser harness dependency discovery", () => {
  it("is selected by both ordinary harness launchers", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    expect(manifest.scripts["demo:clipboard"]).toContain("vite --config vite.browser.config.ts");
    const playwright = readFileSync(new URL("../../../playwright.config.ts", import.meta.url), "utf8");
    expect(playwright).toContain("vite --config vite.browser.config.ts");
  });

  it("scans every ordinary HTML entry without recursing into diagnostic builds", () => {
    const root = config.root;
    if (root === undefined) throw new Error("missing browser harness root");
    const entries = config.optimizeDeps?.entries;
    expect(entries).toEqual(readdirSync(root).filter((name) => name.endsWith(".html")).sort());
    expect(entries).toEqual(["index.html", "manual-clipboard.html", "selection-endpoint.html"]);
  });

  it("keeps optional diagnostic pages available without installing their plugins", () => {
    const root = config.root;
    if (root === undefined) throw new Error("missing browser harness root");
    expect(existsSync(join(root, "property-isolation/index.html"))).toBe(true);
    expect(config.plugins).toBeUndefined();
    expect(config.optimizeDeps?.noDiscovery).not.toBe(true);
  });

  it.each([["Link", link], ["clipboard", clipboard]] as const)(
    "%s diagnostics inherit ordinary entry discovery without dropping their plugins",
    (_name, diagnostic) => {
      expect(diagnostic.root).toBe(config.root);
      expect(diagnostic.optimizeDeps?.entries).toEqual(config.optimizeDeps?.entries);
      expect(diagnostic.optimizeDeps?.noDiscovery).not.toBe(true);
      expect(diagnostic.plugins?.length).toBeGreaterThan(0);
    },
  );
});
