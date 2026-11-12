export function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function validateBase(value) {
  if (!value) return '';
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) throw Error('서버 주소를 확인해 주세요.');
  return u.origin;
}
export async function api(base, path, data, token) {
  const response = await fetch(base+path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : {'Content-Type':'application/json'}), ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10000), credentials:'omit' });
  const result = await response.json(); if (!response.ok) throw Object.assign(Error(result.error || '연결할 수 없어요.'), {status:response.status}); return result;
}
export class Connection {
  constructor(base, session, callbacks) { this.base=base;this.session=session;this.callbacks=callbacks;this.pending=new Map();this.generation=0;this.retries=0;
    this.offline=()=>{if(!this.stopped){this.callbacks.status('reconnecting');this.socket?.close();}};
    this.online=()=>{if(!this.stopped){clearTimeout(this.retryTimer);this.socket?.close();this.connect();}};
    globalThis.addEventListener?.('offline',this.offline);globalThis.addEventListener?.('online',this.online);
  }
  connect() {
    const generation=++this.generation;this.stopped=false;this.callbacks.status('connecting');
    api(this.base,`/rooms/${this.session.roomId}/ticket`,{},this.session.token).then(({ticket})=>{
      if(this.stopped||generation!==this.generation)return;
      const url=new URL(`/rooms/${this.session.roomId}/ws`,this.base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',ticket);
      const ws=this.socket=new WebSocket(url);
      ws.onopen=()=>{
        if(generation!==this.generation){ws.close();return;}
        this.retries=0;this.lastSeen=Date.now();
        clearInterval(this.heartbeat);
        this.heartbeat=setInterval(()=>{
          if(Date.now()-this.lastSeen>35000){ws.close();return;}
          if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({action:'ping'}));
        },15000);
      };
      ws.onmessage=({data})=>{
        if(generation!==this.generation)return;
        let event;try{event=JSON.parse(data);}catch{return;}
        this.lastSeen=Date.now();
        if(event.type==='snapshot'){
          this.state=event.state;this.callbacks.status('online');this.callbacks.state(event.state);
          for(const [id,p]of this.pending)if(p.version!==undefined&&event.state.version>=p.version){clearTimeout(p.timeout);this.pending.delete(id);p.resolve();}
        }else if(event.type==='ack'){
          const p=this.pending.get(event.requestId);if(p){p.version=event.version;if(this.state?.version>=p.version){clearTimeout(p.timeout);this.pending.delete(event.requestId);p.resolve();}}
        }else if(event.type==='error'){
          const p=this.pending.get(event.requestId);if(p){clearTimeout(p.timeout);this.pending.delete(event.requestId);p.reject(Error(event.error));}
          else this.callbacks.error(event.error);
        }
      };
      ws.onclose=({code})=>{
        if(generation!==this.generation||this.stopped)return;
        clearInterval(this.heartbeat);this.rejectPending();
        if(code===4001||code===4003){this.stopped=true;this.callbacks.fatal(code===4001?'다른 탭에서 연결했어요. 사용할 탭을 하나만 남겨 주세요.':'참가 권한이 종료됐어요. 선생님께 확인해 주세요.');return;}
        this.retry();
      };
      ws.onerror=()=>{if(ws.readyState===WebSocket.OPEN)ws.close();};
    }).catch(error=>{
      if(this.stopped||generation!==this.generation)return;
      if([401,403,404,410].includes(error.status)){this.stopped=true;this.callbacks.fatal(error.message);}
      else this.retry();
    });
  }
  retry(){this.callbacks.status('reconnecting');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.connect(),Math.min(8000,500*2**this.retries++)+Math.random()*300);}
  send(action,data={}){
    if(this.socket?.readyState!==WebSocket.OPEN||!this.state)return Promise.reject(Error('다시 연결한 뒤 시도해 주세요.'));
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.pending.delete(requestId);this.socket?.close();reject(Error('응답을 확인하지 못했어요. 다시 연결하고 있어요.'));},7000);
      this.pending.set(requestId,{resolve,reject,timeout});
      this.socket.send(JSON.stringify({action,data,requestId}));
    });
  }
  rejectPending(){for(const p of this.pending.values()){clearTimeout(p.timeout);p.reject(Error('연결이 끊겼어요. 복구 후 판을 확인해 주세요.'));}this.pending.clear();}
  stop(){globalThis.removeEventListener?.('offline',this.offline);globalThis.removeEventListener?.('online',this.online);this.stopped=true;this.generation++;clearInterval(this.heartbeat);clearTimeout(this.retryTimer);this.rejectPending();this.socket?.close();}
}
