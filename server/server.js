require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const redis = require("redis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* ================= REDIS ================= */
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("connect", () => {
  console.log("🔥 Redis connected");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

redisClient.connect().catch((err) => {
  console.error("Redis connection failed:", err.message);
});



/* ================= CONFIG ================= */
const MESSAGE_TTL = 60 * 30; // 30 minutes
const MAX_MESSAGES = 200;  // safety cap per room
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const MEDIA_PREFIX = "__MEDIA__|";

/* ================= ADMIN AUTH MIDDLEWARE ================= */
const adminAuth = (req, res, next) => {
  const pw = req.headers["x-admin-password"];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

/* ================= ADMIN API ================= */

// GET /api/admin/rooms — list all rooms with stats
app.get("/api/admin/rooms", adminAuth, async (req, res) => {
  try {
    // Get all room:*:messages keys
    const keys = await redisClient.keys("room:*:messages");
    const rooms = [];
    for (const key of keys) {
      // key format: room:<roomName>:messages
      const roomName = key.replace(/^room:/, "").replace(/:messages$/, "");

      // Get all messages for this room
      const messages = await redisClient.lRange(key, 0, -1);

      // Count media messages
      let mediaCount = 0;
      let oldestTimestamp = null;
      for (const raw of messages) {
        try {
          const msg = JSON.parse(raw);
          if (msg.message && msg.message.startsWith(MEDIA_PREFIX)) mediaCount++;
          if (msg.timestamp && (oldestTimestamp === null || msg.timestamp < oldestTimestamp)) {
            oldestTimestamp = msg.timestamp;
          }
        } catch { /* skip bad JSON */ }
      }

      // Get online users from Socket.io adapter
      const socketRoom = io.sockets.adapter.rooms.get(roomName);
      const onlineCount = socketRoom ? socketRoom.size : 0;

      // TTL remaining
      const ttl = await redisClient.ttl(key);

      rooms.push({
        name: roomName,
        messageCount: messages.length,
        mediaCount,
        onlineCount,
        createdAt: oldestTimestamp,
        ttl, // seconds remaining
      });
    }

    // Sort by online count desc, then by name
    rooms.sort((a, b) => b.onlineCount - a.onlineCount || a.name.localeCompare(b.name));
    res.json({ rooms });
  } catch (err) {
    console.error("Admin rooms error:", err);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// DELETE /api/admin/rooms/:roomId — delete a room's messages from Redis
app.delete("/api/admin/rooms/:roomId", adminAuth, async (req, res) => {
  try {
    const roomName = decodeURIComponent(req.params.roomId);
    const key = `room:${roomName}:messages`;
    await redisClient.del(key);

    // Kick everyone from the room via Socket.io
    const socketRoom = io.sockets.adapter.rooms.get(roomName);
    if (socketRoom) {
      for (const socketId of socketRoom) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.leave(roomName);
      }
    }

    res.json({ ok: true, deleted: roomName });
  } catch (err) {
    console.error("Admin delete room error:", err);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

/* ================= SOCKET HANDLERS ================= */
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  /* JOIN ROOM (or global) */
  socket.on("join-room", async (room) => {
    const roomName = room || "global";
    socket.join(roomName);
    console.log(socket.id, "joined", roomName);

    try {
      // Send last 7-min messages
      const messages = await redisClient.lRange(
        `room:${roomName}:messages`,
        0,
        -1
      );

      messages.forEach((msg) => {
        socket.emit("receive-message", JSON.parse(msg));
      });
    } catch (err) {
      console.error("Redis fetch error:", err);
    }
  });

  /* CHAT MESSAGE */
  socket.on("chat-message", async (room, name, message) => {
    const roomName = room || "global";

    const payload = {
      name,
      message,
      timestamp: Date.now()
    };

    // Send to others (not sender)
    socket.to(roomName).emit("receive-message", payload);

    try {
      const key = `room:${roomName}:messages`;

      // Store message
      await redisClient.rPush(key, JSON.stringify(payload));

      // Keep list size under control
      await redisClient.lTrim(key, -MAX_MESSAGES, -1);

      // 7-min sliding TTL
      await redisClient.expire(key, MESSAGE_TTL);
    } catch (err) {
      console.error("Redis store error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
