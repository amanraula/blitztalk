const {instrument} = require('@socket.io/admin-ui');
const io = require('socket.io')(3000, {
  cors: {
    origin: '*',
},
});
io.on('connection', socket => {
  console.log('New client connected', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  socket.on('chat-message', (name,message) => {
    console.log('Message received:', message);
    // Broadcast the message to all clients
    if(name===""){
      io.emit('receive-message',{name, message}); //all
    }
    else{
      socket.to(name).emit('receive-message',{name, message}); //to specific room // ***** { }
      //console.log("Message sent to room:", room);
    }
    // socket.broadcast.emit('recieve-message', message); //except for the sender
  });
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room: ${room}`);
  });
})

instrument(io, { auth:false});
