import {readFileSync} from "node:fs";

export function contentsDemoResources(mode, importMap) {
 const shared = mode === "shared";
 const editor = (id, label) => `<section class="editor"><h2>${label}</h2><div class="editor-host" id="${id}"></div></section>`;
 const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Table of contents · Breditor</title>
${importMap}
<style>
*{box-sizing:border-box}
body{margin:auto;max-width:78rem;padding:clamp(1rem,4vw,3rem);background:#f3f7f5;color:#203a38;font:1rem/1.5 system-ui,sans-serif}
body[data-mode="local"]{max-width:55rem}
header{margin-bottom:1.75rem}
header a{color:#235e53;text-underline-offset:.2em;font-size:.875rem}
header h1{margin:1rem 0 .25rem;color:#142e2c;font-size:clamp(2rem,5vw,3rem);line-height:1.1;letter-spacing:-.035em}
header p{margin:0 0 .6rem;color:#41615c}
#contents-ready{color:#41615c;font-size:.875rem}
.editors{display:grid;gap:1rem}
[data-mode="shared"] .editors{grid-template-columns:repeat(2,minmax(0,1fr))}
.editor{min-width:0;padding:1rem;border:1px solid #ccdad4;border-radius:.75rem;background:#fff}
.editor>h2{margin:0 0 .65rem;font-size:1rem}
.editor-host [data-breditor-contents]{margin-block:.7rem;padding:.75rem .9rem;border-color:#d3e3db;background:#eef6f1}
.editor-host [data-breditor-contents] h2{margin:0 0 .35rem;font-size:.95rem}
.editor-host [data-breditor-contents] li{padding-block:.06rem}
.editor-host :is(.breditor-rich-surface,.breditor-shared-surface){height:22rem;overflow-y:auto;overscroll-behavior:contain}
.editor-host :is(.breditor-rich-surface,.breditor-shared-surface) :is(h2,h3){scroll-margin-top:12px}
.editor-host :is(.breditor-rich-surface,.breditor-shared-surface) h2{font-size:1.35rem;margin:.25rem 0}
.editor-host :is(.breditor-rich-surface,.breditor-shared-surface) h3{font-size:1.05rem;margin:1.1rem 0 .2rem}
.editor-host :is(.breditor-rich-surface,.breditor-shared-surface) p{margin:.2rem 0 .85rem;line-height:1.6}
@media(max-width:780px){[data-mode="shared"] .editors{grid-template-columns:minmax(0,1fr)}}
</style>
<body data-mode="${mode}">
 <header>
  <a href="/demo">← ${shared ? "Shared demo" : "Rich content demo"}</a>
  <h1>Table of contents</h1>
  <p>${shared ? "Rename a heading in either editor to update both contents lists." : "Pick a heading to jump to it, or edit its text to update the contents."}</p>
  <div id="contents-ready" role="status">Loading editor…</div>
 </header>
 <main class="editors">
  ${shared ? editor("a", "Writer A") + editor("b", "Writer B") : editor("a", "Local editor")}
 </main>
 <script type="module" src="/contents-demo.mjs"></script>
</body>
</html>`;
 return [
  ["/contents", ["text/html; charset=utf-8", Buffer.from(html)]],
  ["/contents-demo.mjs", ["text/javascript; charset=utf-8", readFileSync(new URL("./demo.mjs", import.meta.url))]],
 ];
}
