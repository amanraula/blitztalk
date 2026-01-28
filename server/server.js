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

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
