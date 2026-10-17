import {VersionCatalogHttp} from "./http.js";
import {versionIdentity} from "./validation.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedDocumentVersionsDiscoveryOptions,SharedDocumentVersionsIdentity} from "./types.js";
/** Explicit online discovery. Save the nonsecret binding before first offline capture; roles are not saved. */
export async function discoverSharedDocumentVersions(options:SharedDocumentVersionsDiscoveryOptions):Promise<{identity:SharedDocumentVersionsIdentity;canPublish:boolean}>{
 const checked=versionIdentity({...options,binding:"0".repeat(64)}),{binding:unbound,...identityFields}=checked,http=new VersionCatalogHttp({...options,...identityFields}),abort=new AbortController();void unbound;
 try{const result=await http.describe(abort.signal),identity=versionIdentity({...checked,binding:result.descriptor.binding});try{await options.saveIdentity({...identity});}catch{throw new SharedRelayError("version_identity_not_saved");}return {identity:Object.freeze(identity),canPublish:result.canPublish};}
 finally{abort.abort();http.dispose();}
}
