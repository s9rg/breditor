/** A real synchronous abort observer tries to claim the same genuine owner.
 * Return its fallback reference BEFORE assertions so a failing control still
 * closes every native borrower and origin writer instead of masking the bug. */
export function takeWithAbortReentry(attempt){const abort=AbortController.prototype.abort,add=EventTarget.prototype.addEventListener;let installed=false,fired=false,nestedOwner,nestedCode,value,outerError,outerFailed=false;
 try{AbortController.prototype.abort=function(...args){if(!installed){installed=true;add.call(this.signal,'abort',()=>{fired=true;try{nestedOwner=attempt.takeOwner();nestedCode='ACCEPTED';}catch(error){nestedCode=error?.code;}},{once:true});}return abort.apply(this,args);};try{value=attempt.takeOwner();}catch(error){outerFailed=true;outerError=error;}}finally{AbortController.prototype.abort=abort;}
 return{owner:value??nestedOwner,fired,nestedCode,outerError,outerFailed};
}
