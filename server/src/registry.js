import { DurableObject } from 'cloudflare:workers';
import { ROOM_MS, KEEP_MS, fail } from './model.js';
import { body, json, hash, errorResponse } from './util.js';
export class Registry extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.queue = Promise.resolve(); }
  fetch(request) {
    const next = this.queue.then(() => this.handle(request)); this.queue = next.catch(() => {}); return next;
  }
  async handle(request) {
    try {
      const action = new URL(request.url).pathname.slice(1), data = await body(request), now = Date.now();
      if (action === 'rate') {
        const key = `rate:${data.key}`, value = await this.ctx.storage.get(key);
        const bucket = value?.until > now ? value : { until: now + 60000, count: 0 };
        if (++bucket.count > data.limit) fail('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
        await this.ctx.storage.put(key, bucket); if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(now+60000); return json({ok:true});
      }
      const registry = await this.ctx.storage.get('codes') || {};
      if (action === 'lookup') {
        if (typeof data.code !== 'string' || !/^[0-9]{4}$/.test(data.code)) fail('방 코드는 숫자 4자리예요.');
        const lease = registry[data.code]; if (!lease || lease.expiresAt <= now) fail('방 코드를 다시 확인해 주세요.', 404);
        return json({ roomId: lease.id });
      }
      if (action === 'create') {
        if (typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) fail('방 생성 자격을 확인해 주세요.');
        if (![3, 5, 7].includes(data.rounds)) fail('라운드를 다시 선택해 주세요.');
        const teacherHash = await hash(data.token);
        const existing = Object.entries(registry).find(([, item]) => item.teacherHash === teacherHash && item.expiresAt > now);
        if (existing) return json({ roomId: existing[1].id, code: existing[0], role: 'teacher' });
        for (const [code, item] of Object.entries(registry)) if (item.expiresAt + KEEP_MS <= now) delete registry[code];
        const start = crypto.getRandomValues(new Uint32Array(1))[0] % 9000;
        let code;
        for (let i = 0; i < 9000; i++) { const candidate = String(1000 + (start + i) % 9000); if (!registry[candidate]) { code = candidate; break; } }
        if (!code) fail('사용 가능한 방 코드가 없어요. 잠시 후 다시 시도해 주세요.', 503);
        const id = crypto.randomUUID();
        const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(id));
        const result = await room.fetch(new Request('https://internal/init', { method: 'POST', body: JSON.stringify({ id, code, rounds: data.rounds, teacherHash }) }));
        if (!result.ok) return result;
        registry[code] = { id, teacherHash, expiresAt: now + ROOM_MS };
        await this.ctx.storage.put('codes',registry);if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(now+60000);
        return json({ roomId: id, code, role: 'teacher' }, 201);
      }
      fail('지원하지 않는 요청이에요.', 404);
    } catch (e) { return errorResponse(e); }
  }
  alarm(){const next=this.queue.then(()=>this.cleanup());this.queue=next.catch(()=>{});return next;}
  async cleanup() {
    const now = Date.now(), rates = await this.ctx.storage.list({ prefix: 'rate:' });
    for (const [key, value] of rates) if (value.until <= now) await this.ctx.storage.delete(key);
    const codes = await this.ctx.storage.get('codes') || {};
    for (const [code, value] of Object.entries(codes)) if (value.expiresAt + KEEP_MS <= now) delete codes[code];
    await this.ctx.storage.put('codes', codes);
    if (Object.keys(codes).length || rates.size) await this.ctx.storage.setAlarm(now + 60000);
  }
}
