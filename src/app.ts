import fileUpload from "express-fileupload";
import session from "express-session";
import fs from "fs";
import rimraf from "rimraf";
import { config } from "./common/config";
import cors from "cors";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { router as zipRouter } from "./routes/zip";
import { router as zipInPlaceRouter } from "./routes/zip_in_place";
import { router as downloadRouter } from "./routes/download";
import { router as fileRouter } from "./routes/file";
import { router as indexRouter } from "./routes/index";
import { router as uploadRouter } from "./routes/upload";
import { logger } from "@user-office-software/duo-logger";
import { configureLogger } from "./common/configureLogger";

const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(
  cors({
    exposedHeaders: [
      "Accept-Ranges",
      "Content-Disposition",
      "Content-Length",
      "Content-Range",
    ],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.locals.routeBasePath = getForwardedPrefix(req);
  next();
});

app.use(express.static("public"));
app.use(
  session({
    secret: config.sessionSecret || "WARNING_UNSAFE",
    resave: false,
    saveUninitialized: true,
    name: "zip-service.sid",
  })
);
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: config.zipDir,
    debug: true,
  })
);

app.use("/", indexRouter);
app.use("/zip", zipRouter);
app.use("/zip_in_place", zipInPlaceRouter);
app.use("/download", downloadRouter);
app.use("/file", fileRouter);
app.use("/upload", uploadRouter);

configureLogger(
  config.graylogEnabled,
  config.graylogServer,
  config.graylogPort,
  config.environment
);

// Delete all zip files in config.path_to_zipped_files older than one hour.
const deleteZipFiles = () => {
  try {
    fs.readdir(config.zipDir, function (err, files) {
      files.forEach(function (file) {
        fs.stat(path.join(config.zipDir, file), function (err2, stat) {
          if (err2) {
            logger.logError("Error occured while checking file " + file, {
              err2,
            });

            return;
          }
          const now = new Date().getTime();
          const endTime = new Date(stat.ctime).getTime() + 60 * 60 * 1000;
          if (now > endTime) {
            return rimraf(path.join(config.zipDir, file), function (err3) {
              if (err3) {
                logger.logError("Error occured while trying to delete file: " + file, { err3 });

                return;
              }
              logger.logInfo("successfully deleted", {});
            });
          }
        });
      });
    });
  } catch (error) {
    logger.logInfo("Couldn't delete files", {});
  }
};
setInterval(deleteZipFiles, config.zipRetentionMillis || 60 * 60 * 1000);

function getForwardedPrefix(req: express.Request) {
  const forwardedPrefix = req.headers["x-forwarded-prefix"];
  const prefix = Array.isArray(forwardedPrefix)
    ? forwardedPrefix[0]
    : forwardedPrefix || "";
  const firstPrefix = prefix.split(",")[0].trim();

  if (!firstPrefix || firstPrefix === "/") {
    return "";
  }

  const prefixedPath = firstPrefix.startsWith("/")
    ? firstPrefix
    : `/${firstPrefix}`;

  return prefixedPath.endsWith("/")
    ? prefixedPath.slice(0, -1)
    : prefixedPath;
}

export default app;
