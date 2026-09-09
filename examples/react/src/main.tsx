import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BreditorEditor } from "./BreditorEditor.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("React root is missing");

const primaryModifier = /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
  ? "meta"
  : "control";

createRoot(root).render(
  <StrictMode>
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">Rust core · WebAssembly runtime · React shell</p>
        <h1>Breditor</h1>
        <p className="hero-copy">
          A small, real browser editor built on a typed document tree and
          semantic commands. This page runs the reference Highlight extension
          end to end.
        </p>
      </header>

      <section className="demo-panel" aria-labelledby="demo-heading">
        <div className="demo-intro">
          <div>
            <p className="section-kicker">Interactive reference</p>
            <h2 id="demo-heading">Format, undo, and keep writing.</h2>
          </div>
          <p>
            Select some text, then use Bold or Highlight. Undo and Redo replay
            the same semantic operations through the Rust-owned editor state.
          </p>
        </div>

        <BreditorEditor
          label="Breditor Highlight reference document"
          primaryModifier={primaryModifier}
        />

        <aside className="demo-hints" aria-label="Demo tips">
          <p>
            <span className="hint-number">01</span>
            Click in “Highlighted text,” select a range, and toggle its format.
          </p>
          <p>
            <span className="hint-number">02</span>
            Press <kbd>{primaryModifier === "meta" ? "⌘" : "Ctrl"}</kbd> +{" "}
            <kbd>B</kbd> for bold.
          </p>
          <p>
            <span className="hint-number">03</span>
            Changes autosave in this browser. The status line reports the real
            persistence state.
          </p>
        </aside>
      </section>

      <footer className="architecture-note">
        React owns the frame. Breditor owns the toolbar and editable DOM. The
        canonical document AST and history live behind the WebAssembly
        boundary.
      </footer>
    </main>
  </StrictMode>,
);
