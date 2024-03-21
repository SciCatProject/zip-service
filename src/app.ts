import fileUpload from "express-fileupload";
import session from "express-session";
import fs from "fs";
import rimraf from "rimraf";
import { config } from "./common/config";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { router as zipInPlaceRouter } from "./routes/zip_in_place";
import { router as zipRouter } from "./routes/zip";
import { router as downloadRouter } from "./routes/download";
import { router as indexRouter } from "./routes/index";
import { router as uploadRouter } from "./routes/upload";
import { logger } from "@user-office-software/duo-logger";

const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
app.use("/upload", uploadRouter);

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
                logger.logError(
                  "Error occured while trying to delete file " + file,
                  { err3 }
                );

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

export default app;
