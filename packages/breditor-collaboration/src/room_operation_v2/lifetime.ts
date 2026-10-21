/** A held parent closes on either actual database version change. Guard calls
 * remain synchronous and are checked again after application code returns. */
import {v2Authority,v2Failure,v2Signal} from "./errors.js";
export interface V2OperationLife{changed:boolean;closing:boolean;closed:boolean;released:boolean}
export function v2Fence(db:IDBDatabase,life:V2OperationLife):void{db.onversionchange=()=>{life.changed=true;db.close();};}
export function v2Lifetime(checkAuthority:()=>void,signal?:AbortSignal):{life:V2OperationLife;guard:()=>void}{
 const life:V2OperationLife={changed:false,closing:false,closed:false,released:false},authority=v2Authority(checkAuthority),check=()=>{if(life.changed||life.closing||life.closed)throw v2Failure("room_v2_closed");v2Signal(signal);};
 return{life,guard(){check();authority();check();}};
}
