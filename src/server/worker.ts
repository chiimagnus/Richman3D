import { DurableObject } from "cloudflare:workers";
import { Game } from "../domain/game";
import { createMatchConfig, SEAT_IDS } from "../domain/config";
import { MAPS } from "../domain/maps";
import type { Command, GameEvent, PlayerId, SavedGameState } from "../domain/types";
import { memberInput, object, projectGame, PROTOCOL_VERSION, ROOM_CODE, ROOM_TOKEN, ROOM_TTL, type RoomError, type RoomOptions, type ServerMessage } from "../network/protocol";

interface Env { ROOMS: DurableObjectNamespace<Room>; ASSETS: Fetcher; ROOM_LIMIT: RateLimit }
type Member = { id: PlayerId; name: string | null; token: string };
type StoredRoom = { code: string; options: RoomOptions; members: Member[]; expiresAt: number; game: SavedGameState | null };
type Attachment = { playerId: PlayerId | null; window: number; count: number };

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function error(error: RoomError, status = 400) { return json({ error }, status); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/health" && request.method === "GET") return json({ version: PROTOCOL_VERSION });
    const route = /^\/api\/rooms\/([^/]+)\/(create|join|socket)$/.exec(url.pathname);
    if (!route || !ROOM_CODE.test(route[1]!)) return error("not_found", 404);
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== url.origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return error("forbidden", 403);
    if (route[2] === "socket" ? request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket" || origin !== url.origin : request.method !== "POST") return error("invalid_request");
    if (request.method === "POST" && !request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return error("invalid_request");
    const limit = await env.ROOM_LIMIT.limit({ key: `richman3d:${request.headers.get("CF-Connecting-IP") ?? "lan"}` });
    if (!limit.success) return error("rate_limited", 429);
    return env.ROOMS.get(env.ROOMS.idFromName(route[1]!)).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").at(-1);
    if (action === "socket") {
      const stored = await this.read();
      if (!stored) return error("not_found", 404);
      const protocols = request.headers.get("Sec-WebSocket-Protocol")?.split(",").map((value) => value.trim()) ?? [];
      const token = protocols.find((value) => value.startsWith("seat."))?.slice(5);
      if (!protocols.includes(`richman-v${PROTOCOL_VERSION}`)) return error("incompatible", 400);
      if (!token || !ROOM_TOKEN.test(token)) return error("forbidden", 403);
      const member = stored.members.find((member) => member.token === token);
      if (!member) return error("forbidden", 403);
      for (const previous of this.ctx.getWebSockets()) {
        if ((previous.deserializeAttachment() as Attachment).playerId === member.id) {
          previous.serializeAttachment({ playerId: null, window: Date.now(), count: 0 } satisfies Attachment);
          previous.close(1008, "replaced");
        }
      }
      const pair = new WebSocketPair();
      pair[1].serializeAttachment({ playerId: member.id, window: Date.now(), count: 0 } satisfies Attachment);
      this.ctx.acceptWebSocket(pair[1]);
      this.sendState(pair[1], stored, [], true);
      for (const current of this.ctx.getWebSockets()) {
        if (current !== pair[1]) this.sendState(current, stored, [], false);
      }
      return new Response(null, { status: 101, webSocket: pair[0], headers: { "Sec-WebSocket-Protocol": `richman-v${PROTOCOL_VERSION}` } });
    }
    let input: ReturnType<typeof memberInput>;
    try {
      const body = await request.text();
      if (body.length > 2048) return error("invalid_request");
      input = memberInput(JSON.parse(body), action === "create");
    } catch { return error("invalid_request"); }
    try {
      const stored = await this.read();
      if (stored?.members.some((member) => member.token === input.token)) return json({ ok: true });
      if (action === "create") {
        if (stored) return error("forbidden", 409);
        const next: StoredRoom = { code: url.pathname.split("/")[3]!, options: input.options!, members: [{ id: "p1", name: input.name, token: input.token }], expiresAt: Date.now() + ROOM_TTL, game: null };
        await this.save(next);
        return json({ ok: true });
      }
      if (!stored) return error("not_found", 404);
      if (stored.game) return error("started", 409);
      if (stored.members.length >= stored.options.seats) return error("full", 409);
      const next: StoredRoom = { ...stored, members: [...stored.members, { id: SEAT_IDS[stored.members.length]!, name: input.name, token: input.token }], expiresAt: Date.now() + ROOM_TTL };
      await this.save(next);
      this.broadcast(next, [], true);
      return json({ ok: true });
    } catch { return error("storage_failed", 503); }
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let message: Record<string, unknown>;
    const attachment = socket.deserializeAttachment() as Attachment;
    if (typeof data !== "string" || data.length > 4096) { this.reject(socket, "invalid_request"); return; }
    const now = Date.now();
    if (now - attachment.window >= 10_000) { attachment.window = now; attachment.count = 0; }
    attachment.count += 1;
    socket.serializeAttachment(attachment);
    if (attachment.count > 40) { this.reject(socket, "rate_limited"); socket.close(1008, "rate_limited"); return; }
    try { const parsed: unknown = JSON.parse(data); if (!object(parsed)) throw new Error(); message = parsed; }
    catch { this.reject(socket, "invalid_request"); return; }
    try {
      const stored = await this.read();
      if (!stored) { this.reject(socket, "not_found"); socket.close(1008, "not_found"); return; }
      const actor = attachment.playerId;
      if (actor === null) { this.reject(socket, "forbidden"); socket.close(1008, "forbidden"); return; }
      let game: Game;
      let events: readonly GameEvent[] = [];
      if (message.kind === "start" && Object.keys(message).length === 1) {
        if (actor !== "p1") { this.reject(socket, "forbidden"); return; }
        if (stored.game) { this.reject(socket, "started"); return; }
        const connected = new Set(this.ctx.getWebSockets().map((current) => (current.deserializeAttachment() as Attachment).playerId));
        if (stored.members.length !== stored.options.seats || stored.members.some((member) => !connected.has(member.id))) { this.reject(socket, "not_ready"); return; }
        const config = createMatchConfig(crypto.getRandomValues(new Uint32Array(1))[0]!, stored.options.seats);
        const map = MAPS.find((map) => map.id === stored.options.mapId)!;
        game = new Game({ ...config, rulesVersion: stored.options.rulesVersion, mapId: map.id, mapVersion: map.version,
          players: config.players.map((player, index) => ({ ...player, controller: "human", name: stored.members[index]!.name })) });
      } else if (message.kind === "command" && Object.keys(message).length === 2 && object(message.command)) {
        if (!stored.game) { this.reject(socket, "not_ready"); return; }
        if (message.command.actor !== actor) { this.reject(socket, "forbidden"); return; }
        game = Game.restore(stored.game);
        const result = game.apply(message.command as Command);
        if (!result.ok) { this.reject(socket, result.reason === "stale_revision" ? "stale_revision" : "illegal_action"); this.sendState(socket, stored, [], true); return; }
        events = result.events;
      } else { this.reject(socket, "invalid_request"); return; }
      const { map: _map, rules: _rules, ...savedGame } = game.snapshot;
      const next: StoredRoom = { ...stored, game: savedGame, expiresAt: now + ROOM_TTL };
      await this.save(next);
      this.broadcast(next, events, false);
    } catch { this.reject(socket, "storage_failed"); }
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    socket.serializeAttachment({ playerId: null, window: Date.now(), count: 0 } satisfies Attachment);
    socket.close(code);
    const stored = await this.read();
    if (stored) this.broadcast(stored, [], false);
  }

  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket, 1011); }

  async alarm(): Promise<void> {
    const stored = await this.ctx.storage.get<StoredRoom>("room");
    if (stored && stored.expiresAt > Date.now()) { await this.ctx.storage.setAlarm(stored.expiresAt); return; }
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "expired");
    await this.ctx.storage.deleteAll();
  }

  private async read(): Promise<StoredRoom | undefined> {
    const stored = await this.ctx.storage.get<StoredRoom>("room");
    if (stored && stored.expiresAt <= Date.now()) {
      for (const socket of this.ctx.getWebSockets()) {
        socket.serializeAttachment({ playerId: null, window: Date.now(), count: 0 } satisfies Attachment);
        socket.close(1001, "expired");
      }
      await this.ctx.storage.deleteAll();
      return undefined;
    }
    return stored;
  }

  private async save(stored: StoredRoom): Promise<void> {
    await this.ctx.storage.transaction(async () => {
      await this.ctx.storage.put("room", stored);
      await this.ctx.storage.setAlarm(stored.expiresAt);
    });
  }

  private reject(socket: WebSocket, error: RoomError): void {
    socket.send(JSON.stringify({ version: PROTOCOL_VERSION, kind: "error", error } satisfies ServerMessage));
  }

  private sendState(socket: WebSocket, stored: StoredRoom, events: readonly GameEvent[], reset: boolean): void {
    const actor = (socket.deserializeAttachment() as Attachment).playerId;
    if (actor === null) return;
    const connected = new Set(this.ctx.getWebSockets().map((current) => (current.deserializeAttachment() as Attachment).playerId));
    socket.send(JSON.stringify({ version: PROTOCOL_VERSION, kind: "state", reset, events,
      room: { code: stored.code, options: stored.options, expiresAt: stored.expiresAt, playerId: actor,
        members: stored.members.map((member) => ({ id: member.id, name: member.name, connected: connected.has(member.id) })),
        snapshot: stored.game ? projectGame(Game.restore(stored.game).snapshot, actor) : null } } satisfies ServerMessage));
  }

  private broadcast(stored: StoredRoom, events: readonly GameEvent[], reset: boolean): void {
    for (const socket of this.ctx.getWebSockets()) {
      try { this.sendState(socket, stored, events, reset); } catch { socket.close(1011, "send_failed"); }
    }
  }
}
