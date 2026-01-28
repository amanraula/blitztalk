const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("join-room", (room) => {
        if (room) {
            socket.join(room);
            console.log(socket.id, "joined room", room);
        } else {
            console.log(socket.id, "joined global");
        }
    });

    socket.on("chat-message", (room, name, message) => {
        const payload = { name, message };

        // 🔥 CRITICAL FIX: do NOT send back to sender
        if (room) {
            socket.to(room).emit("receive-message", payload);
        } else {
            socket.broadcast.emit("receive-message", payload);
        }
    });

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
