import { memberInput, object, PROTOCOL_VERSION, ROOM_CODE, ROOM_TOKEN, type ClientMessage, type RoomError, type RoomOptions, type RoomState, type ServerMessage } from "./protocol";
import type { Command } from "../domain/types";
import { validateRoomState } from "./readState";

export type RoomCredential = { readonly code: string; readonly token: string; readonly action: "create" | "join"; readonly name: string; readonly options: RoomOptions | null };
export type RememberedRoom = { readonly kind: "empty" | "invalid" | "unavailable" } | { readonly kind: "valid"; readonly credential: RoomCredential };
export type RoomView = {
  readonly status: "connecting" | "connected" | "disconnected" | "disposed";
  readonly room: RoomState | null;
  readonly error: RoomError | "unavailable" | null;
  readonly pending: boolean;
  readonly remembered: boolean;
  readonly message: Extract<ServerMessage, { kind: "state" }> | null;
};
const STORAGE_KEY = "richman3d.room.v1";

export function readRoomCredential(storage: Pick<Storage, "getItem">): RememberedRoom {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { kind: "empty" };
    try {
      const value: unknown = JSON.parse(raw);
      if (!object(value) || Object.keys(value).length !== 5 || typeof value.code !== "string" || !ROOM_CODE.test(value.code) ||
          (value.action !== "create" && value.action !== "join") || typeof value.name !== "string" || value.action === "join" && value.options !== null) throw new Error();
      const input = memberInput(value.action === "create" ? { token: value.token, name: value.name, options: value.options } : { token: value.token, name: value.name }, value.action === "create");
      return { kind: "valid", credential: { code: value.code, token: input.token, name: value.name, action: value.action, options: input.options } };
    } catch { return { kind: "invalid" }; }
  } catch { return { kind: "unavailable" }; }
}

export function roomCredential(action: "create" | "join", name: string, code: string, options: RoomOptions | null): RoomCredential {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const selectedCode = action === "create" ? [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => alphabet[byte % alphabet.length]).join("") : code.trim().toUpperCase();
  if (!ROOM_CODE.test(selectedCode) || !ROOM_TOKEN.test(token)) throw new Error("invalid_request");
  memberInput(action === "create" ? { token, name, options } : { token, name }, action === "create");
  return { action, code: selectedCode, token, name, options: action === "create" ? options : null };
}

export class RoomClient {
  private view: RoomView = { status: "connecting", room: null, error: null, pending: false, remembered: false, message: null };
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private readonly abort = new AbortController();
  private pendingRevision: number | null = null;

  constructor(readonly credential: RoomCredential, private readonly storage: Pick<Storage, "setItem">, private readonly origin: string) {}
  getSnapshot = (): RoomView => this.view;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  async enter(): Promise<void> {
    if (this.view.status === "disposed") return;
    this.disconnect();
    this.publish({ status: "connecting", error: null, pending: false });
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.credential)); this.publish({ remembered: true }); }
    catch { this.publish({ remembered: false }); }
    try {
      const { action, code, token, name, options } = this.credential;
      const response = await fetch(`${this.origin}/api/rooms/${code}/${action}`, { method: "POST", signal: this.abort.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "create" ? { token, name, options } : { token, name }) });
      if (this.abort.signal.aborted) return;
      if (!response.ok) {
        const result: unknown = await response.json();
        this.publish({ status: "disconnected", error: object(result) && knownError(result.error) ? result.error : "unavailable" });
        return;
      }
      this.connect();
    } catch { if (!this.abort.signal.aborted) this.publish({ status: "disconnected", error: "unavailable" }); }
  }

  reconnect(): void {
    if (this.view.status === "disposed" || this.view.status === "connecting") return;
    if (!this.view.room) { void this.enter(); return; }
    this.connect();
  }

  start(): boolean { return this.send({ kind: "start" }, -1); }
  command(command: Command): boolean { return this.send({ kind: "command", command }, command.expectedRevision); }

  private connect(): void {
    this.disconnect();
    this.publish({ status: "connecting", pending: false, error: null });
    const url = new URL(`/api/rooms/${this.credential.code}/socket`, this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    try {
      const socket = new WebSocket(url, [`richman-v${PROTOCOL_VERSION}`, `seat.${this.credential.token}`]);
      this.socket = socket;
      socket.addEventListener("message", (event: MessageEvent) => {
        if (this.socket !== socket) return;
        try {
          const value: unknown = JSON.parse(String(event.data));
          if (!object(value) || value.version !== PROTOCOL_VERSION) { this.publish({ error: "incompatible", status: "disconnected" }); this.disconnect(); return; }
          if (value.kind === "error" && knownError(value.error)) {
            this.pendingRevision = null;
            this.publish({ error: value.error, pending: false });
          } else if (value.kind === "state" && validState(value, this.credential.code)) {
            const message = value as Extract<ServerMessage, { kind: "state" }>;
            if (message.reset || this.pendingRevision !== null && message.room.snapshot !== null && message.room.snapshot.revision > this.pendingRevision) this.pendingRevision = null;
            this.publish({ status: "connected", room: message.room, message, error: message.reset ? this.view.error : null, pending: this.pendingRevision !== null });
          } else { this.publish({ status: "disconnected", error: "incompatible", pending: false }); this.disconnect(); }
        } catch { this.publish({ status: "disconnected", error: "incompatible", pending: false }); this.disconnect(); }
      });
      const disconnected = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.pendingRevision = null;
        this.publish({ status: "disconnected", pending: false, error: this.view.error ?? "unavailable" });
      };
      socket.addEventListener("close", disconnected);
      socket.addEventListener("error", disconnected);
    } catch { this.publish({ status: "disconnected", error: "unavailable", pending: false }); }
  }

  private send(message: ClientMessage, revision: number): boolean {
    if (this.view.status !== "connected" || this.view.pending || this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.pendingRevision = revision;
      this.publish({ pending: true, error: null });
      this.socket.send(JSON.stringify(message));
      return true;
    } catch { this.disconnect(); this.publish({ status: "disconnected", pending: false, error: "unavailable" }); return false; }
  }

  dispose(): void {
    if (this.view.status === "disposed") return;
    this.abort.abort(); this.disconnect();
    this.publish({ status: "disposed", pending: false }); this.listeners.clear();
  }
  private disconnect(): void {
    const socket = this.socket;
    this.socket = null; this.pendingRevision = null;
    if (socket) socket.close();
  }
  private publish(change: Partial<RoomView>): void {
    if (this.view.status === "disposed") return;
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) { try { listener(); } catch {} }
  }
}

const ERRORS: readonly RoomError[] = ["invalid_request", "not_found", "full", "started", "forbidden", "not_ready", "stale_revision", "illegal_action", "storage_failed", "rate_limited", "incompatible"];
function knownError(value: unknown): value is RoomError { return typeof value === "string" && ERRORS.includes(value as RoomError); }
function validState(message: Record<string, unknown>, code: string): boolean {
  try { validateRoomState(message, code); return true; } catch { return false; }
}
