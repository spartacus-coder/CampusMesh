import {
  SIGNALING_LIMITS,
  validateSignalingMessage,
  type SignalingRoomMessage,
  type MailboxRecord,
} from "./index";

export interface Env {
  ROOM_COORDINATOR?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(req: Request): Promise<Response> };
  };
}

export interface ClientAttachment {
  fingerprint: string;
  joinedAt: number;
}

interface DurableObjectStateLike {
  acceptWebSocket?(ws: WebSocket, tags?: string[]): void;
  getWebSockets?(tag?: string): WebSocket[];
  getTags?(ws: WebSocket): string[];
  storage?: {
    get?<T>(key: string): Promise<T | undefined>;
    put?(key: string, value: unknown): Promise<void>;
    delete?(key: string): Promise<boolean>;
    list?<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
    setAlarm?(time: number): Promise<void>;
    deleteAll?(): Promise<void>;
  };
}

export class RoomCoordinator {
  private sockets = new Map<string, WebSocket>();
  private mailbox = new Map<string, MailboxRecord>();

  constructor(
    public state: DurableObjectStateLike | null,
    public env: Env,
  ) {}

  private getSocket(fingerprint: string): WebSocket | undefined {
    let ws = this.sockets.get(fingerprint);
    if ((!ws || ws.readyState !== 1) && this.state?.getWebSockets) {
      const list = this.state.getWebSockets(fingerprint);
      const first = list && list.length > 0 ? list[0] : undefined;
      if (first && first.readyState === 1) {
        ws = first;
        this.sockets.set(fingerprint, ws);
      }
    }
    return ws && ws.readyState === 1 ? ws : undefined;
  }

  public getClientCount(): number {
    return this.getAllSockets().size;
  }

  private getAllSockets(): Map<string, WebSocket> {
    const result = new Map<string, WebSocket>();
    for (const [fp, ws] of this.sockets.entries()) {
      if (ws.readyState === 1) result.set(fp, ws);
    }
    if (this.state?.getWebSockets) {
      for (const ws of this.state.getWebSockets()) {
        if (ws.readyState === 1) {
          const tags = this.state.getTags ? this.state.getTags(ws) : [];
          const firstTag = tags && tags.length > 0 ? tags[0] : undefined;
          if (firstTag) {
            result.set(firstTag, ws);
            this.sockets.set(firstTag, ws);
          }
        }
      }
    }
    return result;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal Inter-DO message delivery endpoint
    if (url.pathname === "/deliver" || url.pathname === "/internal/deliver") {
      try {
        const msg = (await request.json()) as SignalingRoomMessage;
        console.log(
          `[DO deliver] Received deliver for ${msg.targetFingerprint}`,
        );
        if (!msg.targetFingerprint) {
          return new Response("Missing targetFingerprint", { status: 400 });
        }
        const targetSocket = this.getSocket(msg.targetFingerprint);
        console.log(
          `[DO deliver] targetSocket found? ${Boolean(targetSocket)} (active: ${this.getAllSockets().size})`,
        );
        if (targetSocket) {
          targetSocket.send(JSON.stringify(msg));
          return new Response(JSON.stringify({ status: "delivered_live" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else if (
          msg.type === "chat_message" ||
          msg.type === "mailbox_deposit"
        ) {
          await this.depositMailbox(
            msg.senderFingerprint,
            msg.targetFingerprint,
            msg.data,
          );
          return new Response(JSON.stringify({ status: "deposited_mailbox" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ status: "peer_offline" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    }

    const upgradeHeader = request.headers.get("Upgrade");

    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade request", {
        status: 426,
      });
    }

    const fingerprint = url.searchParams.get("fp");
    if (!fingerprint || fingerprint.length < 16) {
      return new Response('Missing or invalid "fp" fingerprint parameter', {
        status: 400,
      });
    }

    const activeSockets = this.getAllSockets();

    // Check room capacity limit (Fail-closed mesh scaling rule: max 8 clients per room)
    if (
      activeSockets.size >= SIGNALING_LIMITS.MAX_CLIENTS_PER_ROOM &&
      !activeSockets.has(fingerprint)
    ) {
      return new Response(
        JSON.stringify({
          error: "ROOM_CAPACITY_EXCEEDED",
          maxClients: SIGNALING_LIMITS.MAX_CLIENTS_PER_ROOM,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    type WSWithAccept = WebSocket & { accept?: () => void };
    const globalObj = globalThis as unknown as {
      WebSocketPair: new () => [WebSocket, WSWithAccept];
    };
    const pair = new globalObj.WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Cloudflare Hibernation support
    if (this.state?.acceptWebSocket) {
      this.state.acceptWebSocket(server, [fingerprint]);
    } else {
      if (server.accept) server.accept();
    }

    this.sockets.set(fingerprint, server);

    // Immediately inform the joining client of existing peers in the room
    const existingPeers = Array.from(this.getAllSockets().keys()).filter(
      (fp) => fp !== fingerprint,
    );
    if (existingPeers.length > 0) {
      try {
        server.send(
          JSON.stringify({
            type: "room_peers",
            senderFingerprint: "server",
            data: { peers: existingPeers },
          }),
        );
      } catch {
        // Ignore initial send failure
      }
    }

    // Deliver any pending offline messages from mailbox immediately upon connect
    await this.deliverPendingMailbox(fingerprint, server);

    // Schedule cleanup alarm (15 minutes from now)
    if (this.state?.storage?.setAlarm) {
      const expiration =
        Date.now() + SIGNALING_LIMITS.ROOM_EXPIRATION_SECONDS * 1000;
      await this.state.storage.setAlarm(expiration);
    }

    this.setupSocketListeners(server, fingerprint);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as unknown as ResponseInit);
  }

  // --- Cloudflare Hibernation Handlers ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let fingerprint = "";
    if (this.state?.getTags) {
      const tags = this.state.getTags(ws);
      if (tags && tags.length > 0 && tags[0]) fingerprint = tags[0];
    }
    if (!fingerprint) {
      for (const [fp, s] of this.sockets.entries()) {
        if (s === ws) {
          fingerprint = fp;
          break;
        }
      }
    }
    if (fingerprint) {
      await this.handleMessage(fingerprint, message);
    }
  }

  async webSocketClose(ws: WebSocket) {
    let fingerprint = "";
    if (this.state?.getTags) {
      const tags = this.state.getTags(ws);
      if (tags && tags.length > 0 && tags[0]) fingerprint = tags[0];
    }
    if (!fingerprint) {
      for (const [fp, s] of this.sockets.entries()) {
        if (s === ws) {
          fingerprint = fp;
          break;
        }
      }
    }
    if (fingerprint) {
      this.handleClose(fingerprint);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private setupSocketListeners(ws: WebSocket, fingerprint: string) {
    ws.addEventListener("message", (event: MessageEvent) => {
      this.handleMessage(fingerprint, event.data as string | ArrayBuffer);
    });

    ws.addEventListener("close", () => {
      this.handleClose(fingerprint);
    });

    ws.addEventListener("error", () => {
      this.handleClose(fingerprint);
    });
  }

  public async handleMessage(senderFp: string, rawData: string | ArrayBuffer) {
    if (typeof rawData !== "string") return;
    if (rawData.length > SIGNALING_LIMITS.MAX_MESSAGE_BYTES) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }

    if (!validateSignalingMessage(parsed)) return;

    const msg: SignalingRoomMessage = parsed;
    console.log(
      `[DO handleMessage] From ${senderFp}, type: ${msg.type}, target: ${msg.targetFingerprint}`,
    );

    if (msg.type === "ping") {
      const socket = this.getSocket(senderFp);
      if (socket && socket.readyState === 1) {
        socket.send(
          JSON.stringify({ type: "pong", senderFingerprint: "server" }),
        );
      }
      return;
    }

    if (
      msg.type === "chat_message" ||
      msg.type === "chat_ack" ||
      msg.type === "call_signal"
    ) {
      if (!msg.targetFingerprint) return;
      const targetSocket = this.getSocket(msg.targetFingerprint);
      if (targetSocket) {
        targetSocket.send(
          JSON.stringify({
            ...msg,
            senderFingerprint: senderFp,
          }),
        );
      } else {
        await this.forwardOrDeposit(senderFp, msg);
      }
      return;
    }

    if (msg.type === "mailbox_deposit") {
      if (!msg.targetFingerprint) return;
      await this.depositMailbox(senderFp, msg.targetFingerprint, msg.data);
      return;
    }

    if (msg.type === "mailbox_fetch") {
      const socket = this.getSocket(senderFp);
      if (socket) {
        await this.deliverPendingMailbox(senderFp, socket);
      }
      return;
    }

    // Direct relay or Inter-DO forwarding to target peer (offers, answers, candidates)
    if (msg.targetFingerprint) {
      const targetSocket = this.getSocket(msg.targetFingerprint);
      if (targetSocket) {
        targetSocket.send(
          JSON.stringify({
            ...msg,
            senderFingerprint: senderFp,
          }),
        );
      } else {
        await this.forwardOrDeposit(senderFp, msg);
      }
      return;
    }

    // Broadcast to all other peers in the room
    const allSockets = this.getAllSockets();
    for (const [otherFp, socket] of allSockets.entries()) {
      if (otherFp !== senderFp && socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            ...msg,
            senderFingerprint: senderFp,
          }),
        );
      }
    }
  }

  public handleClose(fingerprint: string) {
    this.sockets.delete(fingerprint);

    // Broadcast peer departure
    const allSockets = this.getAllSockets();
    for (const socket of allSockets.values()) {
      if (socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "leave",
            senderFingerprint: fingerprint,
          }),
        );
      }
    }
  }

  private async forwardOrDeposit(senderFp: string, msg: SignalingRoomMessage) {
    if (!msg.targetFingerprint) return;
    console.log(
      `[DO] forwardOrDeposit from ${senderFp} to ${msg.targetFingerprint}`,
    );

    if (this.env?.ROOM_COORDINATOR) {
      try {
        const targetRoom = `user_${msg.targetFingerprint}`;
        console.log(`[DO] Looking up target room: ${targetRoom}`);
        const targetId = this.env.ROOM_COORDINATOR.idFromName(targetRoom);
        const targetStub = this.env.ROOM_COORDINATOR.get(targetId);
        const resp = await targetStub.fetch(
          new Request("http://internal/deliver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...msg,
              senderFingerprint: senderFp,
            }),
          }),
        );
        const respText = await resp.text();
        console.log(`[DO] Inter-DO response: ${resp.status} ${respText}`);
        return;
      } catch (err) {
        console.error(`[DO] Inter-DO fetch failed:`, err);
      }
    } else {
      console.warn(`[DO] this.env.ROOM_COORDINATOR is missing!`);
    }

    if (msg.type === "chat_message" || msg.type === "mailbox_deposit") {
      await this.depositMailbox(senderFp, msg.targetFingerprint, msg.data);
    }
  }

  private async deliverPendingMailbox(fingerprint: string, socket: WebSocket) {
    this.purgeExpiredMailbox();
    const pending: MailboxRecord[] = [];
    for (const [id, record] of this.mailbox.entries()) {
      if (record.recipientFingerprint === fingerprint) {
        pending.push(record);
        this.mailbox.delete(id);
      }
    }

    if (this.state?.storage?.list) {
      try {
        const stored = await this.state.storage.list<MailboxRecord>({
          prefix: "mbx_",
        });
        for (const [key, record] of stored.entries()) {
          if (record.recipientFingerprint === fingerprint) {
            pending.push(record);
            if (this.state.storage.delete) {
              await this.state.storage.delete(key);
            }
          }
        }
      } catch (err) {
        console.warn("[DO] Failed reading mailbox from storage:", err);
      }
    }

    if (pending.length > 0 && socket.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: "mailbox_deliver",
          senderFingerprint: "server",
          mailboxMessages: pending,
        }),
      );
    }
  }

  private async depositMailbox(
    senderFp: string,
    targetFp: string,
    data: unknown,
  ) {
    this.purgeExpiredMailbox();
    if (this.mailbox.size >= SIGNALING_LIMITS.MAX_MAILBOX_MESSAGES_PER_ROOM) {
      const socket = this.getSocket(senderFp);
      if (socket) {
        socket.send(
          JSON.stringify({
            type: "mailbox_deliver",
            senderFingerprint: "server",
            data: { error: "MAILBOX_CAPACITY_EXCEEDED" },
          }),
        );
      }
      return;
    }

    const id = `mbx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const record: MailboxRecord = {
      id,
      recipientFingerprint: targetFp,
      senderFingerprint: senderFp,
      envelope: typeof data === "string" ? data : JSON.stringify(data),
      createdAt: now,
      expiresAt: now + SIGNALING_LIMITS.MAILBOX_TTL_SECONDS * 1000,
    };
    this.mailbox.set(id, record);

    if (this.state?.storage?.put) {
      try {
        await this.state.storage.put(id, record);
      } catch (err) {
        console.warn("[DO] Failed writing mailbox to storage:", err);
      }
    }
  }

  public purgeExpiredMailbox(): number {
    const now = Date.now();
    let purged = 0;
    for (const [id, record] of this.mailbox.entries()) {
      if (record.expiresAt <= now) {
        this.mailbox.delete(id);
        purged++;
      }
    }
    return purged;
  }

  public getMailboxCount(): number {
    return this.mailbox.size;
  }

  async alarm() {
    this.purgeExpiredMailbox();
    const active = this.getAllSockets();
    if (active.size === 0 && this.mailbox.size === 0) {
      if (this.state?.storage?.deleteAll) {
        await this.state.storage.deleteAll();
      }
    }
  }
}

export { RoomCoordinator as RoomCoordinatorDO };
