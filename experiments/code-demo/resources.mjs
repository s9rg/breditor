import {readFileSync} from "node:fs";

export function codeDemoResources(mode, importMap) {
 const shared = mode === "shared";
 const editor = (id, label) => `<section class="editor-pane" aria-labelledby="code-pane-${id}"><h2 id="code-pane-${id}">${label}</h2><div data-demo-editor id="${id}"></div></section>`;
 const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code highlighting · Breditor</title>
${importMap}
<link rel="stylesheet" href="/code-demo.css">
<body data-code-demo="${mode}">
 <a class="skip-link" href="#code-editors">Skip to code editors</a>
 <header>
  <nav aria-label="Demo navigation"><a href="/demo">← ${shared ? "Shared demo" : "Rich content demo"}</a></nav>
  <h1>Code highlighting</h1>
  <p>${shared
   ? "Edit either writer to see syntax colors follow the shared document."
   : "Edit an example or change its code language from the toolbar."}</p>
  <div class="demo-controls">
   <label><input id="syntax-colors" type="checkbox" checked disabled> Syntax colors</label>
   <span id="code-ready" role="status">Loading editor…</span>
  </div>
 </header>
 <main id="code-editors" class="editors" tabindex="-1">
  ${shared ? editor("a", "Writer A") + editor("b", "Writer B") : editor("a", "Local editor")}
 </main>
 <script type="module" src="/code-demo.mjs"></script>
</body>
</html>`;
 return [
  ["/code", ["text/html; charset=utf-8", Buffer.from(html)]],
  ["/code-demo.css", ["text/css; charset=utf-8", readFileSync(new URL("./demo.css", import.meta.url))]],
  ["/code-demo.mjs", ["text/javascript; charset=utf-8", readFileSync(new URL("./demo.mjs", import.meta.url))]],
 ];
}
