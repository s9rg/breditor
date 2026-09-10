import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BreditorEditor } from "./BreditorEditor.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("React root is missing");

const primaryModifier = /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
  ? "meta"
  : "control";
const primaryKey = primaryModifier === "meta" ? "⌘" : "Ctrl";

createRoot(root).render(
  <StrictMode>
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">Rust core · WebAssembly runtime · React shell</p>
        <h1>Breditor</h1>
        <p className="hero-copy">
          A small, real browser editor built on a typed document tree and
          semantic commands. This page runs a complete nine-control formatting
          showcase through the Rust core, including Highlight, safe Link, and
          Clear formatting.
        </p>
      </header>

      <section className="demo-panel" aria-labelledby="demo-heading">
        <div className="demo-intro">
          <div>
            <p className="section-kicker">Interactive reference</p>
            <h2 id="demo-heading">Format, undo, and keep writing.</h2>
          </div>
          <p>
            Select some text, then combine Bold, Italic, Strikethrough, Code,
            Highlight, or the Link form—or clear the complete inline format set
            in one step. Undo and Redo replay the same semantic operations
            through the Rust-owned editor state.
          </p>
        </div>

        <BreditorEditor
          label="Breditor showcase document"
          primaryModifier={primaryModifier}
        />

        <aside className="demo-hints" aria-label="Demo tips">
          <p>
            <span className="hint-number">01</span>
            Select a range, enter an HTTPS URL, then apply a safe Link.
          </p>
          <p>
            <span className="hint-number">02</span>
            Try <kbd>{primaryKey}+I</kbd>, <kbd>{primaryKey}+E</kbd>, or{" "}
            <kbd>{primaryKey}+Shift+S</kbd>. The toolbar advertises the same
            profile-checked shortcuts to assistive technology. Browser- or
            OS-reserved combinations may stay with browser chrome.
          </p>
          <p>
            <span className="hint-number">03</span>
            Changes autosave in this browser. The status line reports the real
            persistence state.
          </p>
        </aside>
      </section>

      <footer className="architecture-note">
        React owns the frame and empty mounts. Breditor owns the declarative
        toolbar, typed Link form, and editable DOM. The canonical document AST
        and history live behind the WebAssembly boundary.
      </footer>
    </main>
  </StrictMode>,
);
