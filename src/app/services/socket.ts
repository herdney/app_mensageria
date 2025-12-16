// src/services/socket.ts
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const socket: Socket = io(SOCKET_URL, {
    path: "/socket.io",
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
});

export function connectSocket() {
    if (!socket.connected) socket.connect();
    return socket;
}

export function disconnectSocket() {
    if (socket.connected) socket.disconnect();
}

socket.on("connect", () => {
    console.log("[socket] connected:", socket.id, "->", SOCKET_URL);
});

socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
});

socket.on("connect_error", (err) => {
    console.error("[socket] connect_error:", err.message);
});
