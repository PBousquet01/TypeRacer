// Starts Next.js and Socket.IO together on one port.
// Run with `bun run dev` (NOT `next dev`, or the sockets won't exist).
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerRoomHandlers, type IO } from "./server/rooms";
import { handleApi } from "./server/api";
import { tokenFromCookies, userForToken } from "./server/auth";
import { migrate } from "./server/db";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();
await migrate(); // creates any missing tables

const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((err) => {
      console.error("api error", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Something broke on the server." }));
    });
    return;
  }
  handle(req, res);
});
// destroyUpgrade: false → Socket.IO leaves other WebSocket connections alone.
// Without it, it kills Next's hot-reload socket every second, which breaks
// page navigation in dev.
const io: IO = new Server(httpServer, { destroyUpgrade: false });

// The socket shares the browser's cookies, so a signed-in rider is known
// here too — that's how results get attached to an account and how unlocked
// mounts are checked.
io.use(async (socket, next) => {
  try {
    socket.data.roomCode = null;
    socket.data.user = await userForToken(tokenFromCookies(socket.handshake.headers.cookie));
  } catch (err) {
    console.error("could not look up the session for a socket", err);
    socket.data.user = null; // they just race as a guest
  }
  next();
});

io.on("connection", (socket) => registerRoomHandlers(io, socket));

httpServer.listen(port, () => {
  console.log(`🐤 Kweh! Ready on http://localhost:${port}`);
});
