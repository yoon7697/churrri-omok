export const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export function secret() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function body(request) {
  if (Number(request.headers.get('Content-Length')) > 4096) throw Object.assign(new Error('요청이 너무 커요.'), { status: 413 });
  let text = '';
  if(request.body){const reader=request.body.getReader();let total=0;const decoder=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>4096){await reader.cancel();throw Object.assign(new Error('요청이 너무 커요.'),{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  }
  try { const v = JSON.parse(text); if (!v || Array.isArray(v) || typeof v !== 'object') throw Error(); return v; }
  catch { throw Object.assign(new Error('요청 형식을 확인해 주세요.'), { status: 400 }); }
}
export const errorResponse = e => json({ error: e.status ? e.message : '서버에 연결할 수 없어요. 다시 시도해 주세요.' }, e.status || 500);
