/** Synthetic Fullscreen API for portable SDK tests. Never browser/activation evidence. */
export function fullscreenNativeFixture(window){
 const d=window.document,flags=new Set(),stack=[],requests=[],originalMatches=window.Element.prototype.matches;let nextGate=null,exits=0;
 window.Element.prototype.matches=function(selector){return selector===":fullscreen"?flags.has(this):originalMatches.call(this,selector);};
 Object.defineProperty(d,"fullscreenEnabled",{value:true,configurable:true});Object.defineProperty(d,"fullscreenElement",{get:()=>stack.at(-1)??null,configurable:true});
 const change=()=>d.dispatchEvent(new window.Event("fullscreenchange")),push=node=>{stack.push(node);flags.add(node);change();};
 window.HTMLElement.prototype.requestFullscreen=function(options){requests.push({target:this,options});const gate=nextGate;nextGate=null;if(gate)return gate.promise.then(()=>push(this));push(this);return Promise.resolve();};
 d.exitFullscreen=()=>{exits++;flags.delete(stack.pop());change();return Promise.resolve();};
 return{requests,get exits(){return exits;},get active(){return d.fullscreenElement;},delayNext(){if(nextGate)throw Error("A synthetic request is already delayed");let resolve;const promise=new Promise(done=>{resolve=done;});nextGate={promise};return resolve;}};
}
