import app from "./app";
import cors from "cors";
import http from "http";

const port = parseInt(process.env.PORT || "3011", 10);
app.set("port", port);
app.use(cors());

const server = http.createServer(app);
server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: Record<string, unknown>) {
  if (error.syscall !== "listen") {
    throw error;
  }
  const bind = "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
  case "EACCES":
    console.error(bind + " requires elevated privileges");
    process.exit(1);
    break;
  case "EADDRINUSE":
    console.error(bind + " is already in use");
    process.exit(1);
    break;
  default:
    throw error;
  }
}
function onListening() {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  console.log("Running on " + bind);
}
