import Hyperswarm from "hyperswarm";
import Corestore from "corestore";
import Autobase from "autobase";
import Protomux from "protomux";
import c from "compact-encoding";
import b4a from "b4a";
import fs from "bare-fs";
import os from "bare-os";
import path from "bare-path";
import process from "bare-process";

/**
 * Holepunch Bare Runtime Swarm Sidecar for CampusMesh Desktop.
 * Speaks newline-delimited JSON RPC over stdin/stdout with Rust Tauri supervisor.
 */

const args = process.argv;
let dataDir = path.join(os.tmpdir(), "campusmesh-swarm");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--data-dir" && args[i + 1]) {
    dataDir = args[i + 1];
    i++;
  }
}

let store = null;
let swarm = null;
let localFingerprint = "";
let localDisplayName = "CampusMesh Node";
const topics = new Map(); // topicHex -> discovery session
const peerConns = new Map(); // peerPublicKeyHex -> { conn, msgPort, fingerprint, displayName, topics: Set }
const fpToPeerKey = new Map(); // fingerprint -> peerPublicKeyHex
const autobases = new Map(); // groupId -> { base, lastSeq, writerRequests: Set }

function writeJsonLine(obj) {
  try {
    // Use native Bare console.log rather than bare-process Pipe(1) stdout.write,
    // which can stall Windows anonymous pipes when stdout is piped by Rust/Node.
    console.log(JSON.stringify(obj));
  } catch {
    // Ignore closed pipe during shutdown
  }
}

function emit(event, data = {}) {
  writeJsonLine({ event, ...data });
}

function sendReply(id, ok, resultOrError) {
  const payload = ok
    ? { replyId: id, ok: true, result: resultOrError }
    : { replyId: id, ok: false, error: String(resultOrError) };
  writeJsonLine(payload);
}

async function ensureDir(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch {
    // Already exists
  }
}

async function startSwarm(initOpts = {}) {
  if (initOpts.localFingerprint) localFingerprint = initOpts.localFingerprint;
  if (initOpts.displayName) localDisplayName = initOpts.displayName;

  if (swarm && store) {
    return {
      status: "online",
      swarmPublicKey: b4a.toString(swarm.keyPair.publicKey, "hex"),
      peerCount: peerConns.size,
    };
  }

  await ensureDir(dataDir);
  store = new Corestore(dataDir);
  await store.ready();

  // Derive persistent deterministic Noise keypair inside Corestore primary namespace
  const identityCore = store.get({ name: "cm-swarm-identity" });
  await identityCore.ready();
  const keyPair = await store.createKeyPair("cm-hyperswarm-node-v1");

  swarm = new Hyperswarm({ keyPair });

  swarm.on("connection", (conn, peerInfo) => {
    const peerKeyHex = b4a.toString(peerInfo.publicKey, "hex");
    const mux = Protomux.from(conn);
    store.replicate(conn);

    const peerRecord = {
      conn,
      msgPort: null,
      fingerprint: null,
      displayName: null,
      topics: new Set(),
      discoveryKey: b4a.toString(peerInfo.publicKey, "hex").slice(0, 16),
    };
    peerConns.set(peerKeyHex, peerRecord);

    const ch = mux.createChannel({
      protocol: "campusmesh/rpc/v1",
      onopen() {
        // Advertise our CampusMesh identity + subscribed topics & autobase groups
        sendPeerPacket(peerRecord, {
          type: "cm_hello",
          fingerprint: localFingerprint,
          displayName: localDisplayName,
          topics: Array.from(topics.keys()),
        });
        emit("swarm-peer-joined", {
          peerId: peerRecord.fingerprint || peerKeyHex,
          swarmPublicKey: peerKeyHex,
          discoveryKey: peerRecord.discoveryKey,
          connectionType: "direct-utp",
        });
      },
      onclose() {
        handlePeerClose(peerKeyHex, peerRecord);
      },
    });

    if (ch) {
      const msgPort = ch.addMessage({
        encoding: c.string,
        onmessage(str) {
          handleRemotePeerMessage(peerKeyHex, peerRecord, str);
        },
      });
      peerRecord.msgPort = msgPort;
      ch.open();
    }

    conn.on("close", () => {
      handlePeerClose(peerKeyHex, peerRecord);
    });

    conn.on("error", () => {
      handlePeerClose(peerKeyHex, peerRecord);
    });
  });

  emit("swarm-status", {
    status: "online",
    swarmPublicKey: b4a.toString(swarm.keyPair.publicKey, "hex"),
    peerCount: peerConns.size,
  });

  return {
    status: "online",
    swarmPublicKey: b4a.toString(swarm.keyPair.publicKey, "hex"),
    peerCount: peerConns.size,
  };
}

function handlePeerClose(peerKeyHex, peerRecord) {
  if (!peerConns.has(peerKeyHex)) return;
  peerConns.delete(peerKeyHex);
  if (
    peerRecord.fingerprint &&
    fpToPeerKey.get(peerRecord.fingerprint) === peerKeyHex
  ) {
    fpToPeerKey.delete(peerRecord.fingerprint);
  }
  emit("swarm-peer-left", {
    peerId: peerRecord.fingerprint || peerKeyHex,
    swarmPublicKey: peerKeyHex,
  });
}

function sendPeerPacket(peerRecord, obj) {
  if (!peerRecord?.msgPort) return false;
  try {
    peerRecord.msgPort.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

async function handleRemotePeerMessage(peerKeyHex, peerRecord, rawStr) {
  try {
    const packet = JSON.parse(rawStr);
    if (!packet || typeof packet.type !== "string") return;

    if (packet.type === "cm_hello") {
      if (packet.fingerprint) {
        peerRecord.fingerprint = packet.fingerprint;
        fpToPeerKey.set(packet.fingerprint, peerKeyHex);
      }
      if (packet.displayName) {
        peerRecord.displayName = packet.displayName;
      }
      if (Array.isArray(packet.topics)) {
        for (const t of packet.topics) peerRecord.topics.add(t);
      }
      emit("swarm-peer-joined", {
        peerId: peerRecord.fingerprint || peerKeyHex,
        swarmPublicKey: peerKeyHex,
        discoveryKey: peerRecord.discoveryKey,
        displayName: peerRecord.displayName || undefined,
        connectionType: "direct-utp",
      });
      return;
    }

    if (packet.type === "cm_topic_sub" && packet.topicHex) {
      peerRecord.topics.add(packet.topicHex);
      return;
    }

    if (packet.type === "cm_data" && typeof packet.payload === "string") {
      emit("swarm-data", {
        peerId: packet.senderFingerprint || peerRecord.fingerprint || peerKeyHex,
        topicHex: packet.topicHex || null,
        payloadBase64: packet.payload,
      });
      return;
    }

    if (
      packet.type === "autobase_writer_request" &&
      packet.groupId &&
      packet.writerKeyHex
    ) {
      const ctx = autobases.get(packet.groupId);
      if (ctx && ctx.base.writable && !ctx.writerRequests.has(packet.writerKeyHex)) {
        ctx.writerRequests.add(packet.writerKeyHex);
        await ctx.base.append({ addWriter: packet.writerKeyHex });
      }
      return;
    }
  } catch {
    // Ignore malformed packet
  }
}

async function joinTopic(topicHex) {
  if (!swarm) await startSwarm();
  if (topics.has(topicHex)) return { topicHex, alreadyJoined: true };

  const topicBuf = b4a.from(topicHex, "hex");
  const discovery = swarm.join(topicBuf, { server: true, client: true });
  topics.set(topicHex, discovery);

  // Notify currently connected peers of new topic subscription
  for (const peer of peerConns.values()) {
    sendPeerPacket(peer, { type: "cm_topic_sub", topicHex });
  }

  await discovery.flushed();
  return { topicHex, joined: true };
}

async function leaveTopic(topicHex) {
  const discovery = topics.get(topicHex);
  if (discovery) {
    topics.delete(topicHex);
    await discovery.destroy();
  }
  return { topicHex, left: true };
}

function sendDirect(peerIdOrKey, payloadBase64) {
  const key = fpToPeerKey.get(peerIdOrKey) || peerIdOrKey;
  const peer = peerConns.get(key);
  if (!peer) {
    return { sent: false };
  }
  const ok = sendPeerPacket(peer, {
    type: "cm_data",
    senderFingerprint: localFingerprint,
    payload: payloadBase64,
  });
  return { sent: ok };
}

function broadcastTopic(topicHex, payloadBase64) {
  let sentCount = 0;
  for (const peer of peerConns.values()) {
    if (peer.topics.has(topicHex) || peerConns.size <= 8) {
      if (
        sendPeerPacket(peer, {
          type: "cm_data",
          topicHex,
          senderFingerprint: localFingerprint,
          payload: payloadBase64,
        })
      ) {
        sentCount++;
      }
    }
  }
  return { sentCount };
}

async function emitNewAutobaseEntries(groupId, ctx) {
  if (ctx.draining) {
    ctx.drainPending = true;
    return;
  }
  ctx.draining = true;
  try {
    do {
      ctx.drainPending = false;
      await ctx.base.update();
      const len = ctx.base.view.length;
      while (ctx.lastSeq < len) {
        const seq = ctx.lastSeq;
        ctx.lastSeq++;
        const entry = await ctx.base.view.get(seq);
        emit("autobase-entry", {
          groupId,
          seq,
          entry,
        });
      }
    } while (ctx.drainPending);
  } finally {
    ctx.draining = false;
  }
}

async function openAutobase({ groupId, bootstrapKeyHex }) {
  if (!swarm || !store) await startSwarm();

  if (autobases.has(groupId)) {
    const existing = autobases.get(groupId);
    return {
      groupId,
      autobaseKey: b4a.toString(existing.base.key, "hex"),
      discoveryKey: b4a.toString(existing.base.discoveryKey, "hex"),
      writerKey: b4a.toString(existing.base.local.key, "hex"),
      writable: existing.base.writable,
      viewLength: existing.base.view.length,
    };
  }

  const groupStore = store.namespace(`group-${groupId}`);
  const bootstrapBuf = bootstrapKeyHex
    ? b4a.from(bootstrapKeyHex, "hex")
    : null;

  const base = new Autobase(groupStore, bootstrapBuf, {
    valueEncoding: "json",
    open(viewStore) {
      return viewStore.get("messages", { valueEncoding: "json" });
    },
    async apply(nodes, view, host) {
      for (const node of nodes) {
        const val = node.value;
        if (!val) continue;
        if (val.addWriter) {
          await host.addWriter(b4a.from(val.addWriter, "hex"), {
            indexer: false,
          });
          continue;
        }
        await view.append(val);
      }
    },
  });

  await base.ready();

  const ctx = {
    base,
    lastSeq: base.view.length,
    writerRequests: new Set(),
  };
  autobases.set(groupId, ctx);

  base.on("update", () => {
    void emitNewAutobaseEntries(groupId, ctx).catch(() => {});
  });

  // Join the Autobase discoveryKey on HyperDHT so peers gossip logs automatically
  const dkHex = b4a.toString(base.discoveryKey, "hex");
  const discovery = swarm.join(base.discoveryKey, { server: true, client: true });
  topics.set(`ab_${dkHex}`, discovery);

  // If not writable yet, ask connected peers in the swarm to add our writer key
  const writerKeyHex = b4a.toString(base.local.key, "hex");
  if (!base.writable) {
    for (const peer of peerConns.values()) {
      sendPeerPacket(peer, {
        type: "autobase_writer_request",
        groupId,
        writerKeyHex,
      });
    }
  }

  const info = {
    groupId,
    autobaseKey: b4a.toString(base.key, "hex"),
    discoveryKey: dkHex,
    writerKey: writerKeyHex,
    writable: base.writable,
    viewLength: base.view.length,
  };
  emit("autobase-ready", info);
  return info;
}

async function appendAutobase({ groupId, entry }) {
  const ctx = autobases.get(groupId);
  if (!ctx) throw new Error(`Autobase not open for group ${groupId}`);

  if (!ctx.base.writable) {
    const writerKeyHex = b4a.toString(ctx.base.local.key, "hex");
    for (const peer of peerConns.values()) {
      sendPeerPacket(peer, {
        type: "autobase_writer_request",
        groupId,
        writerKeyHex,
      });
    }
    throw new Error("Autobase writer permission pending from group peer");
  }

  await ctx.base.append(entry);
  await emitNewAutobaseEntries(groupId, ctx);
  return { appended: true, viewLength: ctx.base.view.length };
}

async function addAutobaseWriter({ groupId, writerKeyHex }) {
  const ctx = autobases.get(groupId);
  if (!ctx) throw new Error(`Autobase not open for group ${groupId}`);
  await ctx.base.append({ addWriter: writerKeyHex });
  return { added: writerKeyHex };
}

async function getAutobaseHistory({ groupId, limit = 100 }) {
  const ctx = autobases.get(groupId);
  if (!ctx) return { groupId, entries: [] };
  await ctx.base.update();
  const total = ctx.base.view.length;
  const start = Math.max(0, total - limit);
  const entries = [];
  for (let i = start; i < total; i++) {
    entries.push(await ctx.base.view.get(i));
  }
  ctx.lastSeq = total;
  return { groupId, entries };
}

async function shutdown() {
  for (const ctx of autobases.values()) {
    try {
      await ctx.base.close();
    } catch {
      // Ignore
    }
  }
  autobases.clear();
  if (swarm) {
    try {
      await swarm.destroy();
    } catch {
      // Ignore
    }
    swarm = null;
  }
  if (store) {
    try {
      await store.close();
    } catch {
      // Ignore
    }
    store = null;
  }
  process.exit(0);
}

async function handleRpc(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, cmd, params = {} } = req;

  try {
    let res;
    switch (cmd) {
      case "init":
        res = await startSwarm(params);
        break;
      case "join_topic":
        res = await joinTopic(params.topicHex);
        break;
      case "leave_topic":
        res = await leaveTopic(params.topicHex);
        break;
      case "send_direct":
        res = sendDirect(params.peerId, params.payloadBase64);
        break;
      case "broadcast_topic":
        res = broadcastTopic(params.topicHex, params.payloadBase64);
        break;
      case "autobase_open":
        res = await openAutobase(params);
        break;
      case "autobase_append":
        res = await appendAutobase(params);
        break;
      case "autobase_add_writer":
        res = await addAutobaseWriter(params);
        break;
      case "autobase_history":
        res = await getAutobaseHistory(params);
        break;
      case "status":
        res = {
          status: swarm ? "online" : "offline",
          swarmPublicKey: swarm
            ? b4a.toString(swarm.keyPair.publicKey, "hex")
            : null,
          peerCount: peerConns.size,
          peers: Array.from(peerConns.entries()).map(([k, p]) => ({
            peerId: p.fingerprint || k,
            swarmPublicKey: k,
            displayName: p.displayName,
            discoveryKey: p.discoveryKey,
            connectionType: "direct-utp",
          })),
        };
        break;
      case "shutdown":
        if (id !== undefined) sendReply(id, true, { closing: true });
        await shutdown();
        return;
      default:
        throw new Error(`Unknown RPC command: ${cmd}`);
    }
    if (id !== undefined) sendReply(id, true, res);
  } catch (err) {
    if (id !== undefined) sendReply(id, false, err?.message || String(err));
  }
}

let lineBuf = "";
process.stdin.on("data", (chunk) => {
  lineBuf += b4a.toString(chunk);
  let idx;
  while ((idx = lineBuf.indexOf("\n")) !== -1) {
    const line = lineBuf.slice(0, idx).trim();
    lineBuf = lineBuf.slice(idx + 1);
    if (line) void handleRpc(line);
  }
});

process.stdin.on("end", () => {
  void shutdown();
});

emit("swarm-sidecar-booted", { pid: process.pid });
