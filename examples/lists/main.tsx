import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BreditorEditor } from "../react/src/BreditorEditor.js";
import { SessionBackupImporter } from "../react/src/SessionBackupImporter.js";
import "../react/src/styles.css";
import "../headings/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Demo root missing");
const primaryModifier = /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "meta" : "control";
createRoot(root).render(<StrictMode><main className="page-shell">
  <header className="hero"><p className="eyebrow">Breditor · Experimental flat-list demo</p>
    <h1>Ideas, with a little structure.</h1>
    <p className="hero-copy">Headings, bullet lists, numbered lists, and inline formatting—with undo and recovery.</p></header>
  <section className="demo-panel" aria-labelledby="list-demo-title">
    <div className="demo-intro"><div><p className="section-kicker">Feature preview</p>
      <h2 id="list-demo-title">Write, organize, undo, reload.</h2></div>
      <p>Changes autosave in a separate experimental slot. The standard and heading demos stay untouched.</p></div>
    <BreditorEditor label="Breditor list document" primaryModifier={primaryModifier} offerSessionBackup />
    <aside className="demo-hints" aria-label="List demo limits">
      <p>Flat lists first: one paragraph or heading per item. Nested lists and indent/outdent are not supported yet.</p>
      <p>Copy and paste exchange text, not list structure. Images, tables and general rich paste are not supported.</p>
      <p>Session V6 backups belong to this list profile. Recovery opens a separate editor with autosave off.</p>
    </aside>
  </section>
  <SessionBackupImporter primaryModifier={primaryModifier} />
  <footer className="architecture-note">Developer preview, not a published release. Physical clipboard, OS input methods and screen-reader qualification remain in progress.
    {" "}<a href="./manual-clipboard.html">Open the disposable clipboard check.</a></footer>
</main></StrictMode>);
