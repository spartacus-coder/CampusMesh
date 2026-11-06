import { RoomCoordinator, type Env } from "./room-coordinator";

export interface WorkerEnv extends Env {
  ROOM_COORDINATOR: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}

// In-memory per-instance burst rate limiter to guard free tier quota
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 120) {
    // Exceeded 120 requests/minute
    return false;
  }
  record.count++;
  return true;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Rate limiting fail-closed guard
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({
          error: "QUOTA_EXHAUSTION_PROTECTION",
          message:
            "Rate limit exceeded. Fail-closed zero-cost protection engaged.",
          retryAfterSeconds: 60,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Retry-After": "60",
          },
        },
      );
    }

    // 1. Health check
    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "CampusMesh Serverless Signaling Gateway",
          budget: "$0.00/month",
          limits: {
            maxClientsPerRoom: 8,
            requestsPerDayAllocation: 100000,
          },
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // 2. Room WebSocket upgrade: /api/room/:roomId/ws
    const roomMatch = url.pathname.match(/^\/api\/room\/([^/]+)\/ws$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      if (!roomId || roomId.length < 3) {
        return new Response("Invalid roomId", { status: 400 });
      }

      if (!env.ROOM_COORDINATOR) {
        return new Response("Durable Object binding missing", { status: 500 });
      }

      const id = env.ROOM_COORDINATOR.idFromName(roomId);
      const stub = env.ROOM_COORDINATOR.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

export { RoomCoordinator };
