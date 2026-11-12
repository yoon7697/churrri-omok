import { DurableObject } from 'cloudflare:workers';
import { newRoom, nickname, command, expire, view, fail } from './model.js';
import { body, json, secret, hash, errorResponse } from './util.js';

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.queue = Promise.resolve();
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room'); });
  }
  serial(fn) { const next = this.queue.then(() => this.ready).then(fn); this.queue = next.catch(() => {}); return next; }
  actor(id) { return id === 'teacher' ? this.room?.teacher : this.room?.participants.find(p => p.id === id && !p.removed); }
  async authenticate(request) {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) fail('참가 권한을 확인할 수 없어요.', 401);
    const digest = await hash(token);
    const actor = [this.room?.teacher, ...(this.room?.participants || [])].find(p => p && !p.removed && p.hash === digest);
    if (!actor) fail('참가 권한이 없거나 만료됐어요.', 401); return actor;
  }
  onlineIds(now = Date.now()) {
    return [...new Set(this.ctx.getWebSockets().flatMap(ws => {
      const a = ws.deserializeAttachment(), p = a && this.actor(a.id);
      return p && a.id !== 'teacher' && p.epoch === a.epoch && a.lastSeen > now - 45000 && ws.readyState === 1 ? [a.id] : [];
    }))];
  }
  async persist(next) {
    const match = next.matches.at(-1);
    const deadline = match?.status === 'active' ? Math.min(match.deadlineAt, next.expiresAt) : (next.phase === 'closed' ? next.purgeAt : next.expiresAt);
    await this.ctx.storage.transaction(async tx => { await tx.put('room', next); await tx.setAlarm(Math.max(Date.now() + 1, deadline)); });
    this.room = next;
  }
  async updateExpiry(now = Date.now()) {
    if (!this.room) return;
    if (now >= this.room.purgeAt) { await this.ctx.storage.deleteAll(); this.room = null; for (const ws of this.ctx.getWebSockets()) ws.close(4003, 'expired'); return; }
    const next = structuredClone(this.room); if (expire(next, now)) { await this.persist(next); this.broadcast(); }
  }
  snapshot(id) { return view(this.room, id, this.onlineIds(), Date.now()); }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      try { const a = ws.deserializeAttachment(), p = a && this.actor(a.id);
        if (!p || p.epoch !== a.epoch) { ws.close(4003, 'revoked'); continue; }
        ws.send(JSON.stringify({ type: 'snapshot', state: this.snapshot(a.id) }));
      } catch { /* A disconnected socket is removed by the runtime. */ }
    }
  }
  async fetch(request) {
    return this.serial(async () => {
      try {
        const url = new URL(request.url), action = url.pathname.split('/').at(-1);
        if (action === 'init') {
          if (this.room) fail('이미 생성된 방이에요.', 409);
          const data = await body(request); await this.persist(newRoom(data.id, data.code, data.rounds, data.teacherHash, Date.now())); return json({ ok: true });
        }
        await this.updateExpiry(); if (!this.room) fail('방을 찾을 수 없어요.', 404);
        if (action === 'join') {
          if (this.room.phase === 'closed') fail('닫힌 방이에요.', 410);
          if (this.room.locked) fail('선생님이 입장을 잠갔어요.', 403);
          const data = await body(request), name = nickname(data.nickname);
          if (typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) fail('참가 자격을 확인해 주세요.');
          const digest = await hash(data.token);
          const previous = this.room.participants.find(p => p.hash === digest);
          if (previous) { if (previous.removed) fail('대기실에서 내보내졌어요.',403); return json({ roomId:this.room.id, role:'student' }); }
          if (this.room.teacher.hash === digest) fail('학생 참가 자격을 다시 만들어 주세요.');
          if (this.room.participants.filter(p => !p.removed).length >= 2 || this.room.participants.length >= 40) fail('이번 연결 검증 방은 학생 두 명까지 참가할 수 있어요.', 409);
          if (this.room.participants.some(p => !p.removed && p.nickname === name)) fail('같은 닉네임이 있어요.',409);
          const id = crypto.randomUUID(), next = structuredClone(this.room);
          next.participants.push({ id, hash: digest, nickname: name, epoch: 0, points: 0, black: 0, games: 0, removed: false }); next.version++;
          await this.persist(next); this.broadcast(); return json({ roomId: next.id, role: 'student' }, 201);
        }
        if (action === 'ws') {
          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') fail('실시간 연결을 확인해 주세요.', 426);
          const ticket = url.searchParams.get('ticket'); if (!ticket || ticket.length !== 43) fail('연결 티켓이 만료됐어요.', 401);
          const digest = await hash(ticket), entry = this.room.tickets.find(t => t.hash === digest && t.expiresAt > Date.now());
          if (!entry || !this.actor(entry.id)) fail('연결 티켓이 만료됐어요.', 401);
          const next = structuredClone(this.room); next.tickets = next.tickets.filter(t => t.hash !== digest);
          const actor = entry.id === 'teacher' ? next.teacher : next.participants.find(p => p.id === entry.id); actor.epoch++;
          await this.persist(next);
          for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()?.id === entry.id) ws.close(4001, 'replaced');
          const [client, server] = Object.values(new WebSocketPair());
          this.ctx.acceptWebSocket(server); server.serializeAttachment({ id: entry.id, epoch: actor.epoch, lastSeen: Date.now(), window: Date.now(), count: 0 });
          this.broadcast(); return new Response(null, { status: 101, webSocket: client });
        }
        const actor = await this.authenticate(request);
        if (action === 'state' && request.method === 'GET') return json(this.snapshot(actor.id));
        if (action === 'ticket' && request.method === 'POST') {
          const ticket = secret(), next = structuredClone(this.room);
          next.tickets = next.tickets.filter(t => t.expiresAt > Date.now() && t.id !== actor.id);
          next.tickets.push({ hash: await hash(ticket), id: actor.id, expiresAt: Date.now() + 20000 });
          await this.persist(next); return json({ ticket });
        }
        fail('지원하지 않는 요청이에요.', 404);
      } catch (e) { return errorResponse(e); }
    });
  }
  async webSocketMessage(ws, message) {
    return this.serial(async () => {
      let requestId;
      try {
        await this.updateExpiry(); if (!this.room) fail('방이 만료됐어요.', 410);
        const a = ws.deserializeAttachment(), actor = a && this.actor(a.id);
        if (!actor || actor.epoch !== a.epoch) { ws.close(4003, 'revoked'); return; }
        if (typeof message !== 'string' || message.length > 4096) fail('요청이 너무 커요.', 413);
        const data = JSON.parse(message); if (!data || typeof data !== 'object') fail('요청 형식을 확인해 주세요.');
        const now = Date.now();
        if (now - a.window > 10000) { a.window = now; a.count = 0; }
        if (++a.count > 80) fail('요청이 너무 많아요. 잠시 기다려 주세요.', 429);
        a.lastSeen = now; ws.serializeAttachment(a);
        if (data.action === 'ping') { ws.send(JSON.stringify({ type: 'snapshot', state: this.snapshot(a.id) })); return; }
        if (data.action === 'sync') { ws.send(JSON.stringify({ type: 'snapshot', state: this.snapshot(a.id) })); return; }
        requestId = data.requestId;
        if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) fail('요청 번호를 확인해 주세요.');
        const fingerprint = JSON.stringify([data.action, data.data]);
        const previous = this.room.receipts.find(r => r.id === a.id && r.requestId === requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail('이미 사용한 요청 번호예요.', 409);
          ws.send(JSON.stringify({ type: 'ack', requestId, version:this.room.version })); ws.send(JSON.stringify({ type: 'snapshot', state: this.snapshot(a.id) })); return;
        }
        const next = structuredClone(this.room);
        command(next, a.id, data.action, data.data || {}, this.onlineIds(now), now);
        next.receipts.push({ id: a.id, requestId, fingerprint }); next.receipts = next.receipts.slice(-2000);
        await this.persist(next);
        ws.send(JSON.stringify({ type: 'ack', requestId, version:this.room.version })); this.broadcast();
      } catch (e) { try { ws.send(JSON.stringify({ type: 'error', requestId, error: e.status ? e.message : '요청을 처리하지 못했어요. 다시 연결해 주세요.', status: e.status || 500 })); } catch {} }
    });
  }
  webSocketClose(ws, code) { return this.serial(async () => { try { ws.close(code, 'closed'); } catch {} this.broadcast(); }); }
  webSocketError(ws) { return this.webSocketClose(ws, 1011); }
  alarm() { return this.serial(async () => { await this.updateExpiry(); if (this.room) await this.persist(this.room); }); }
}
