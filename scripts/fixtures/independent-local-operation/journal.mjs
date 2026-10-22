/** Fresh host-selected local operation namespaces and native replay factories. */
import{localRecoveryOptions}from'../independent-recovery/session.mjs';
export const localJournalOptions=(f,extra={})=>({database:f.tag+'-journal',sourceDatabase:f.tag+'-current',expected:f.selection,session:localRecoveryOptions(f.options,f.backup,f.tag).session,checkAuthority(){},writerRecovery:'host-reacquired',...extra});
