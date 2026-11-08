import {
  SIGNALING_LIMITS,
  validateSignalingMessage,
  type SignalingRoomMessage,
  type MailboxRecord,
} from "./index";

export interface Env {
  ROOM_COORDINATOR?: unknown;
}

export interface ClientAttachment {
  fingerprint: string;
  joinedAt: number;
}

interface DurableObjectStateLike {
  acceptWebSocket?(ws: WebSocket, tags?: string[]): void;
  storage?: {
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal Inter-DO message delivery endpoint
    if (url.pathname === "/internal/deliver") {
      try {
        const msg = (await request.json()) as SignalingRoomMessage;
        if (!msg.targetFingerprint) {
          return new Response("Missing targetFingerprint", { status: 400 });
        }
        const targetSocket = this.sockets.get(msg.targetFingerprint);
        if (targetSocket && targetSocket.readyState === 1) {
          targetSocket.send(JSON.stringify(msg));
          return new Response(JSON.stringify({ status: "delivered_live" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          this.depositMailbox(
            msg.senderFingerprint,
            msg.targetFingerprint,
            msg.data,
          );
          return new Response(JSON.stringify({ status: "deposited_mailbox" }), {
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

    // Check room capacity limit (Fail-closed mesh scaling rule: max 8 clients per room)
    if (
      this.sockets.size >= SIGNALING_LIMITS.MAX_CLIENTS_PER_ROOM &&
      !this.sockets.has(fingerprint)
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

    // If Cloudflare Hibernation is available in runtime
    if (this.state?.acceptWebSocket) {
      this.state.acceptWebSocket(server, [fingerprint]);
    } else {
      // Standard Node / WinterCG WebSocket acceptance
      if (server.accept) server.accept();
    }

    this.sockets.set(fingerprint, server);

    // Immediately inform the joining client of existing peers in the room
    const existingPeers = Array.from(this.sockets.keys()).filter(
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

  public handleMessage(senderFp: string, rawData: string | ArrayBuffer) {
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

    if (msg.type === "ping") {
      const socket = this.sockets.get(senderFp);
      if (socket && socket.readyState === 1) {
        socket.send(
          JSON.stringify({ type: "pong", senderFingerprint: "server" }),
        );
      }
      return;
    }

    if (msg.type === "chat_message") {
      if (!msg.targetFingerprint) return;
      const targetSocket = this.sockets.get(msg.targetFingerprint);
      if (targetSocket && targetSocket.readyState === 1) {
        targetSocket.send(
          JSON.stringify({
            ...msg,
            senderFingerprint: senderFp,
          }),
        );
      } else {
        this.forwardOrDeposit(senderFp, msg);
      }
      return;
    }

    if (msg.type === "mailbox_deposit") {
      if (!msg.targetFingerprint) return;
      this.depositMailbox(senderFp, msg.targetFingerprint, msg.data);
      return;
    }

    if (msg.type === "mailbox_fetch") {
      this.purgeExpiredMailbox();
      const pending: MailboxRecord[] = [];
      for (const [id, record] of this.mailbox.entries()) {
        if (record.recipientFingerprint === senderFp) {
          pending.push(record);
          this.mailbox.delete(id);
        }
      }

      const socket = this.sockets.get(senderFp);
      if (socket && socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "mailbox_deliver",
            senderFingerprint: "server",
            mailboxMessages: pending,
          }),
        );
      }
      return;
    }

    // Direct relay or Inter-DO forwarding to target peer
    if (msg.targetFingerprint) {
      const targetSocket = this.sockets.get(msg.targetFingerprint);
      if (targetSocket && targetSocket.readyState === 1) {
        targetSocket.send(
          JSON.stringify({
            ...msg,
            senderFingerprint: senderFp,
          }),
        );
      } else {
        this.forwardOrDeposit(senderFp, msg);
      }
      return;
    }

    // Broadcast to all other peers in the room
    for (const [otherFp, socket] of this.sockets.entries()) {
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
    for (const socket of this.sockets.values()) {
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

    const coordinatorBinding = (this.env as Record<string, unknown>)
      .ROOM_COORDINATOR as
      | {
          idFromName(name: string): unknown;
          get(id: unknown): { fetch(req: Request): Promise<Response> };
        }
      | undefined;

    if (coordinatorBinding) {
      try {
        const targetId = coordinatorBinding.idFromName(
          `user_${msg.targetFingerprint}`,
        );
        const targetStub = coordinatorBinding.get(targetId);
        await targetStub.fetch(
          new Request("https://internal/deliver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...msg,
              senderFingerprint: senderFp,
            }),
          }),
        );
        return;
      } catch {
        // Fallback to local mailbox if inter-DO delivery throws
      }
    }

    this.depositMailbox(senderFp, msg.targetFingerprint, msg.data);
  }

  private depositMailbox(senderFp: string, targetFp: string, data: unknown) {
    this.purgeExpiredMailbox();
    if (this.mailbox.size >= SIGNALING_LIMITS.MAX_MAILBOX_MESSAGES_PER_ROOM) {
      const socket = this.sockets.get(senderFp);
      if (socket && socket.readyState === 1) {
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
    // If no connected sockets and mailbox is empty, room has expired; clean up state
    if (
      this.sockets.size === 0 &&
      this.mailbox.size === 0 &&
      this.state?.storage?.deleteAll
    ) {
      await this.state.storage.deleteAll();
    }
  }

  public getClientCount(): number {
    return this.sockets.size;
  }
}

export { RoomCoordinator as RoomCoordinatorDO };
