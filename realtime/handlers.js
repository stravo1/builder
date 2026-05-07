/**
 * Block Data API Handlers - Frappe Socket.IO Realtime Handlers
 *
 * This handler manages all block data API events on the server side.
 * Logic is defined in frontend/src/stores/blockDataApi.ts as createBlockDataHandler()
 * This file is the Node.js CommonJS version
 *
 * Acts as middleman to relay block data between connected Vue clients
 * Receives block_data:updated from one client and broadcasts to all others
 * Handles block_data:request and responds with current block data
 */

// Store of all connected block data clients (for request/response)
const blockDataClients = {};

const blockDataApiHandler = (socket) => {
    /**
     * Forward broadcasted block data
     */
    socket.on("broadcast:block_data", (data) => {
        socket.broadcast.emit("block_data_update", data);
    });

    /**
     * Receive block data request from CLI and pass to Builder UI
     */
    socket.on("request:block_data", () => {
        console.log(
            "[Block Data API] Received block data request from client:",
            socket.id,
        );
        // Attach requester socket ID for response routing
        socket.broadcast.emit("provide:block_data", { socketId: socket.id });
    });

    /**
     * Notify client when connected
     */
    socket.on("connect", () => {
        console.log("[Block Data API] Client connected:", socket.id);
        socket.emit("block_data:connected", {
            socketId: socket.id,
            timestamp: Date.now(),
        });
    });

    /**
     * Clean up when client disconnects
     */
    socket.on("disconnect", () => {
        console.log("[Block Data API] Client disconnected:", socket.id);
        delete blockDataClients[socket.id];
    });

    socket.on("ping_builder", (err) => {
        console.log("Received ping from builder, sending pong");
        socket.emit("pong_builder");
    });
};

export default blockDataApiHandler;
