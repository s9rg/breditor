/** Internal two-phase guard replacement. Validation may only inspect genuine
 * private state and callback-free managed custody; commit may only assign private preparation pointers. All host
 * checks and native/file work must finish before this synchronous barrier. */
export interface ReadyPreparationRetarget {
 validate():void;
 commit():void;
}
/** Never commit one recovery family while another can still refuse validation. */
export function commitReadyPreparationRetargets(input:readonly ReadyPreparationRetarget[]):void{
 const selected=[...input];for(const item of selected)item.validate();for(const item of selected)item.commit();
}
