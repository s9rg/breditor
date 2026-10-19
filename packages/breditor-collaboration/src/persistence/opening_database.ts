import {SharedEditorError} from "../core.js";
/** Guard the unpublished async-factory window before a live session installs its recovery handler. */
export function fenceOpeningDatabase(db:IDBDatabase,code:"session_open_versionchange"|"review_open_versionchange"):{assertCurrent():void;admit<T extends {free():void}>(owner:T):T}{
 let changed=false;
 const assertCurrent=()=>{if(changed)throw new SharedEditorError(code,"Shared storage changed while opening; the unpublished owner cannot be adopted");};
 db.onversionchange=()=>{changed=true;db.close();};
 return{assertCurrent,admit(owner){if(changed){owner.free();assertCurrent();}return owner;}};
}
