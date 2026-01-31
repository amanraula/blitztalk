const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const redis = require("redis");

const app = express();
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
const MESSAGE_TTL = 60 * 7; // 7 minutes
const MAX_MESSAGES = 200;  // safety cap per room

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
