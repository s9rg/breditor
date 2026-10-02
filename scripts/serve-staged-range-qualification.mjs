import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const probe = readFileSync(new URL('../tests/browser/diagnostics/fixtures/numeric-transfer-staged.js', import.meta.url));
const sha256 = createHash('sha256').update(probe).digest('hex');
if (sha256 !== 'efb634fa1e5a8e080e27d177aefcaf181534675c900e60f7649bead66fc5efb9') throw new Error('Probe hash differs');
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor numeric qualification</title><h1>JavaScript-only numerical qualification</h1><p>Five bounded runs of the saved probe. No editor, Rust, Wasm, debugger, storage or clipboard access.</p><p>Probe SHA-256: ${sha256}</p><button id="run">Run five probes</button><pre id="status">Ready</pre><textarea id="report" aria-label="Qualification report" rows="24" cols="100" readonly></textarea><script type="module">
import { probeNumericRange } from '/probe.js';
const button = document.querySelector('#run'), status = document.querySelector('#status'), output = document.querySelector('#report');
button.addEventListener('click', async () => {
  button.disabled = true;
  const report = {probeSha256:'${sha256}', userAgent:navigator.userAgent, runs:[]};
  for (let attempt=1; attempt<=5; attempt++) {
    status.textContent = 'Running '+attempt+'/5';
    try { const result = await probeNumericRange(10000); report.runs.push({attempt, outcome:result.iterations==='10000' && result.checks==='150000'?'passed':'incomplete', result}); }
    catch(error) { report.runs.push({attempt, outcome:'failed', error:String(error)}); }
    output.value = JSON.stringify(report,null,2);
  }
  status.textContent = 'Completed: '+report.runs.filter(run=>run.outcome==='passed').length+'/5 passed';
  button.disabled = false;
});
</script></html>`;
createServer((req,res)=>{
  if(req.method !== 'GET' || !['/','/probe.js'].includes(req.url)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.url==='/'?page:probe);
}).listen(4241,'127.0.0.1',()=>console.log('http://127.0.0.1:4241/'));
