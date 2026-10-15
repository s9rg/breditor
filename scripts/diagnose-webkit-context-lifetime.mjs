// Empty-page control: never loads Breditor, a network resource, or a Wasm module.
import {chromium,firefox,webkit} from "playwright-core";
const name=process.argv[2]??"webkit",engines={chromium,firefox,webkit};
if(!Object.hasOwn(engines,name))throw Error("Choose chromium, firefox or webkit");
const browser=await engines[name].launch();let completed=0,attempted=0;
try{
 for(let index=1;index<=70;index++){
  attempted=index;const context=await browser.newContext();
  try{const page=await context.newPage();await page.goto("data:text/html,<title>Empty browser control</title><p>No Wasm, no editor</p>",{timeout:3000});completed=index;}
  finally{await context.close();}
 }
 console.log(JSON.stringify({control:"empty-browser-contexts",engine:name,completed,attempted}));
}catch(error){console.log(JSON.stringify({control:"empty-browser-contexts",engine:name,completed,attempted,error:String(error)}));process.exitCode=1;}
finally{await browser.close();}
