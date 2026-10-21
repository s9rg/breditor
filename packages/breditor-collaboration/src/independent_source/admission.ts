/** Only a genuine independently selected session can register its privately owned source. */
import type {IndependentSourcePort} from './contract.js';
const sources=new WeakMap<object,IndependentSourcePort>();
export function registerIndependentSource(session:object,port:IndependentSourcePort):void{
 if(sources.has(session))throw Error('Independent source reused');sources.set(session,Object.freeze(port));
}
export function independentSource(session:object):IndependentSourcePort{
 const port=sources.get(session);if(!port)throw Error('An actual independent history session is required');port.check();return port;
}
