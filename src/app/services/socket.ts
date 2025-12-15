import { io } from 'socket.io-client';

// Connect to the local backend server (which relays Evolution API events)
export const socket = io({
    autoConnect: false, // We will connect manually when the app is ready/user is logged in
    reconnection: true,
});

export const connectSocket = () => {
    if (!socket.connected) {
        socket.connect();
        console.log("Socket connecting...");
    }
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
        console.log("Socket disconnected");
    }
};
