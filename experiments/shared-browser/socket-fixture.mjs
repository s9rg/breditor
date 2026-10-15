// Browser test client only, not the distributable reconnect coordinator.
export async function connect(url,principal,token) {
  const socket = new WebSocket(url), pending = new Map(), events = [];
  let next = 0;
  const closed = new Promise(resolve=>socket.addEventListener("close",resolve,{once:true}));
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);
    if(message.format!=="breditor/relay"||message.formatVersion!==1)throw Error("Wrong relay response binding");
    const entry=message.id===null?undefined:pending.get(message.id);
    if(entry){pending.delete(message.id);clearTimeout(entry.timer);entry.resolve(message.result);}else{events.push(message.result);}
  });
  socket.addEventListener("close",()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error("Relay disconnected"));}pending.clear();});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Relay open timed out")),5000);socket.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener("error",()=>{clearTimeout(timer);reject(Error("Relay connection failed"));},{once:true});});
  function request(request) {
    return new Promise((resolve,reject)=>{
      const id=String(++next),timer=setTimeout(()=>{pending.delete(id);reject(Error("Relay reply timed out"));},5000);
      pending.set(id,{resolve,reject,timer});
      try{socket.send(JSON.stringify({format:"breditor/relay",formatVersion:1,id,request}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
    });
  }
  const authenticated=await request({kind:"authenticate",principal,token});
  return {socket,events,authenticated,request,closed,async close(){socket.close();await closed;}};
}
window.relaySocketFixture={connect};
