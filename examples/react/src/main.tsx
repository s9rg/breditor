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
    <main>
      <h1>Breditor React reference</h1>
      <p>The document AST lives in Rust; React owns only the surrounding UI.</p>
      <BreditorEditor
        label="Example rich-text document"
        primaryModifier={primaryModifier}
      />
    </main>
  </StrictMode>,
);
