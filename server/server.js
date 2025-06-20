const io = require('socket.io')(3000, {
  cors: {
    origin: '*',
}});
io.on('connection', socket => {
  console.log('New client connected', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  socket.on('chat-message', (data) => {
    console.log('Message received:', data);
    // Broadcast the message to all clients
    io.emit('receive-message', data);
    // socket.broadcast.emit('recieve-message', data); //except for the sender
  });
})

