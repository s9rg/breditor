import type {SharedRustOwner} from "./types.js";
import {SharedEditorError} from "./core.js";
import {initializeUnclaimedSharedRustOwner} from './raw_owner_lifetime.js';

/**
 * Apply fresh host policy before transferring a newly created/restored native owner.
 * This preserves exact checkpoints and does not infer permission from saved metadata.
 * The native capability refuses forever after initialization or either observation.
 * On failure the caller frees only an unclaimed factory result, never an object
 * already transferred to another editor. There is no
 * fallback to the live setter: that would publish and change the selected backup.
 */
export function initializeSharedReadOnly<T extends SharedRustOwner>(owner:T,readOnly:boolean):T {
 if(typeof readOnly!=="boolean")throw new TypeError("Initial readOnly must be Boolean");
 return initializeUnclaimedSharedRustOwner(owner,()=>{
  if(typeof owner.initial_read_only_version!=="function"||owner.initial_read_only_version()!=="1"||typeof owner.initialize_read_only!=="function")throw new SharedEditorError("initial_read_only_unavailable","Use a matching unobserved native owner with initial read-only enforcement");
  owner.initialize_read_only(readOnly);return owner;
 });
}
