/** Internal reservations are issued only by genuine operation owners. Reserving
 * is synchronous: every family is busy before verification can call host code.
 * No public DTO, readiness marker or selected filename can create a reservation. */
export interface OperationalCohortReservation<S> {
 readonly states:readonly S[];
 verify():Promise<void>;
 markReleased():void;
 checkBindings():void;
 checkCurrent():void;
 disposeAuxiliaries():void;
 checkManaged():void;
 /** Only private flag writes. No native cleanup, host callback or await. */
 consume():void;
 abandon():void;
}
export interface OperationalCohortHandoff<T>{commit():T;abandon():void}

/** One barrier for original, generation and mixed-family room custody. Temporary
 * native reader cleanup may run host factory destructors, so it precedes the last
 * current-policy/source checks. All owners are checked before any is consumed. */
export async function prepareOperationalCohort<T>(
 groups:readonly OperationalCohortReservation<unknown>[],
 take:(released:()=>void)=>Promise<T>,verify:()=>void,checkSources:()=>void,
 closed:()=>Error,
):Promise<OperationalCohortHandoff<T>>{
 let offered=false,finished=false;
 const abandon=()=>{if(finished)return;finished=true;for(const group of groups)group.abandon();};
 try{
  for(const group of groups)await group.verify();
  const result=await take(()=>{for(const group of groups)group.markReleased();});
  const handoff=Object.freeze({commit(){
   if(finished)throw closed();
   try{
    // Reject replaced SDK bindings before origin verification can read them.
    for(const group of groups)group.checkBindings();
    verify();
    for(const group of groups)group.checkCurrent();
    for(const group of groups)group.disposeAuxiliaries();
    for(const group of groups)group.checkCurrent();
    // Guards and native destructors may have replaced a readonly field. Refuse
    // before captured public record readers can enter an application accessor.
    for(const group of groups)group.checkBindings();
    checkSources();
    for(const group of groups)group.checkManaged();
    // Nothing above may consume a child. Nothing below may call application code.
    for(const group of groups)group.consume();
    return result;
   }finally{abandon();}
  },abandon});offered=true;return handoff;
 }finally{if(!offered)abandon();}
}
