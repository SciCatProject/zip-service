import app from "./app";
import cors from "cors";
import http from "http";
import { logger } from "@user-office-software/duo-logger";

const port = parseInt(process.env.PORT || "3011", 10);
app.set("port", port);
app.use(cors());

const server = http.createServer(app);
server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

process.on("uncaughtException", (error) => {
  logger.logException("Unhandled NODE exception", error);
});

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: Record<string, unknown>) {
  if (error.syscall !== "listen") {
    logger.logError("Error received ", error);
    
    throw error;
  }
  const bind = "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
  case "EACCES":
    logger.logError(bind + " requires elevated privileges", error);

    process.exit(1);
    break;
  case "EADDRINUSE":
    logger.logError(bind + " is already in use", error);

    process.exit(1);
    break;
  default:
    logger.logError(bind + " is already in use", error);

    throw error;
  }
}
function onListening() {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  logger.logInfo("Running on " + bind, {});
}
