import { json, body, errorResponse, hash } from './util.js';
import { fail } from './model.js';
export { Room } from './room.js';
export { Registry } from './registry.js';
function allowed(request, env) {
  const origin = request.headers.get('Origin');
  return origin && String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).includes(origin);
}
function cors(response, request) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', request.headers.get('Origin'));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Vary', 'Origin'); headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, stage: 'two-player-online' });
      if (!allowed(request, env)) fail('허용되지 않은 접속 주소예요.', 403);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);
      const registry = env.REGISTRY.get(env.REGISTRY.idFromName('codes-v1'));
      if (request.method === 'POST' && ['/rooms', '/join'].includes(url.pathname)) {
        const ip = request.headers.get('CF-Connecting-IP') || 'local';
        const rate = await registry.fetch(new Request('https://internal/rate', { method: 'POST', body: JSON.stringify({ key: await hash(`${url.pathname}:${ip}`), limit: url.pathname === '/rooms' ? 10 : 40 }) }));
        if (!rate.ok) return cors(rate, request);
        const data = await body(request);
        if (url.pathname === '/rooms') return cors(await registry.fetch(new Request('https://internal/create', { method: 'POST', body: JSON.stringify(data) })), request);
        const found = await registry.fetch(new Request('https://internal/lookup', { method: 'POST', body: JSON.stringify({ code: data.code }) }));
        if (!found.ok) return cors(found, request);
        const { roomId } = await found.json();
        return cors(await env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request('https://internal/join', { method: 'POST', body: JSON.stringify(data) })), request);
      }
      const route = url.pathname.match(/^\/rooms\/([a-f0-9-]{36})\/(state|ticket|ws)$/);
      if (route && ((route[2] === 'ticket' && request.method === 'POST') || (route[2] !== 'ticket' && request.method === 'GET'))) {
        const rate=await registry.fetch(new Request('https://internal/rate',{method:'POST',body:JSON.stringify({key:await hash(`connect:${request.headers.get('CF-Connecting-IP')||'local'}`),limit:120})}));
        if(!rate.ok)return cors(rate,request);
        return cors(await env.ROOMS.get(env.ROOMS.idFromName(route[1])).fetch(new Request(request)), request);
      }
      fail('지원하지 않는 요청이에요.', 404);
    } catch (e) { const response = errorResponse(e); return allowed(request, env) ? cors(response, request) : response; }
  }
};
