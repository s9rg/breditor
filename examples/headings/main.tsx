import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BreditorEditor } from "../react/src/BreditorEditor.js";
import { SessionBackupImporter } from "../react/src/SessionBackupImporter.js";
import "../react/src/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Demo root missing");
const primaryModifier = /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "meta" : "control";
createRoot(root).render(<StrictMode>
  <main className="page-shell">
    <header className="hero">
      <p className="eyebrow">Breditor · Experimental heading demo</p>
      <h1>A little more structure.</h1>
      <p className="hero-copy">Six heading levels, paragraphs, and the existing inline formatting—all backed by Rust history.</p>
    </header>
    <section className="demo-panel" aria-labelledby="heading-demo-title">
      <div className="demo-intro"><div><p className="section-kicker">Feature preview</p>
        <h2 id="heading-demo-title">Write, format, undo, reload.</h2></div>
        <p>Use the block controls to change the current paragraph or selected blocks.
          Changes autosave in a separate experimental slot, leaving the standard demo untouched.</p></div>
      <BreditorEditor label="Breditor heading document" primaryModifier={primaryModifier} offerSessionBackup />
      <aside className="demo-hints" aria-label="Heading demo limits">
        <p>Enter at a heading’s end starts a paragraph; Enter in its middle preserves the heading level.</p>
        <p>Plain-text paste is supported. Lists, images, tables and rich paste are not available in this preview.</p>
        <p>Experimental Session V5 backups belong to this profile. They do not open in the standard demo.</p>
      </aside>
    </section>
    <SessionBackupImporter primaryModifier={primaryModifier} />
    <footer className="architecture-note">Developer preview, not a published release. Native OS input and accessibility qualification are still in progress.</footer>
  </main>
</StrictMode>);
