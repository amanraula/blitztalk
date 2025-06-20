import { io } from "https://cdn.socket.io/4.0.0/socket.io.esm.min.js";
const socket = io("http://localhost:3000");

const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

// When connected
socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id);
});

// Send message
sendButton.addEventListener('click', () => {
  const message = messageInput.value.trim();
  if (message !== '') {
    // emit to server
    socket.emit("message", message, 25);

    // show locally
    appendMessage(`You: ${message}`);
    messageInput.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

// Enter key
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendButton.click();
});

function appendMessage(msg) {
  const messageElement = document.createElement('div');
  messageElement.textContent = msg;
  chatBox.appendChild(messageElement);
}
