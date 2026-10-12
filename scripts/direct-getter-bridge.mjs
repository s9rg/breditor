// Private experiment for known generated getter functions only. Not a hardened
// production bridge: reading function.call is inappropriate for hostile methods.
export const DIRECT_GETTER_BRIDGE='function z(e,t,index,child){let r;if(arguments.length===3)r=e.call(t,index);else if(arguments.length===4)r=e.call(t,index,child);else throw Error("Unexpected getter arity");if(Ph(r))throw TypeError(`generated scalar method returned a thenable`);return r}';
