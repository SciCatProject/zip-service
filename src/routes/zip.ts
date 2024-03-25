import express from "express";
import * as fs from "fs";
import * as crypto from "crypto";
import { config } from "../common/config";
import archiver from "archiver";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";

export const router = express.Router();

/* POST zip */
/**
 * Request zipping of files. Require directory:string and files:string[] in the request body
 */
router.post("/", (req, res) => {
  logger.logInfo("Request has been submitted", {
    directory: req.body.directory,
    fileNames: req.body.files,
  });

  const { hasAccess, statusCode, error, directory, fileNames } = hasFileAccess(
    req,
    req.body.directory,
    req.body.files
  );

  if (!hasAccess) {
    logger.logError("Error: ", { statusCode, error });

    return res.render("error", { statusCode, error });
  }
  try {
    const zipFileName =
      crypto.createHash("md5").update(directory).digest("hex") +
      "_" +
      new Date().getTime() +
      ".zip";
    logger.logInfo("Zip file name : " + zipFileName, {});
    req.session.zipData = initSession(directory, fileNames, zipFileName);
    res.render("zipping", { total: fileNames.length, zipFileName });
    if (!fs.existsSync(config.zipDir)) {
      fs.mkdirSync(config.zipDir);
    }
    const fileStream = fs.createWriteStream(config.zipDir + "/" + zipFileName);
    const archive = archiver("zip", {
      gzip: true,
      zlib: { level: 9 },
    });
    archive.on("error", function (err) {
      logger.logError("Error in archiver", { err });
    });
    fileStream.on("close", function () {
      req.session.zipData.ready = true;
      req.session.save();
    });
    archive.on("entry", function () {
      req.session.zipData.files[
        req.session.zipData.currentFileIndex
      ].progress = 1;
      req.session.zipData.currentFileIndex += 1;
      req.session.zipData.zipSizeOnLastCompletedEntry = getFileSizeInBytes(
        config.zipDir + "/" + zipFileName
      );
      req.session.save();
    });
    archive.pipe(fileStream);
    try {
      fileNames.map((fileName: string) => {
        if (fs.existsSync(directory)) {
          archive.file(directory + "/" + fileName, { name: fileName });
        }
      });
    } catch (error) {
      logger.logError("Failed zipping " + directory, {});
    }
    archive.finalize();
  } catch (error) {
    res.statusCode = 500;
    res.send("The files could not be zipped");
    return;
  }
});

// Polled periodically from the zipping view. Returns current progress or resulting file name if the zipping is done
router.get("/", (req, res) => {
  const {
    currentFileIndex,
    ready,
    files,
    zipFileName,
    zipSizeOnLastCompletedEntry,
  } = req.session.zipData;
  const zipSize = getFileSizeInBytes(config.zipDir + "/" + zipFileName);
  if (ready || currentFileIndex === files.length) {
    return res.send(req.session.zipData);
  }
  const bytesForCurrentFile = zipSize - zipSizeOnLastCompletedEntry;
  const fraction = bytesForCurrentFile / files[currentFileIndex].size;
  req.session.zipData.files[currentFileIndex].progress = Math.min(fraction, 1);
  return res.send(req.session.zipData);
});

const getFileSizeInBytes = (filename: string) => {
  const stats = fs.statSync(filename);
  return stats.size;
};

const initSession = (
  directory: string,
  fileNames: string[],
  zipFileName: string
): Global.ZipData => {
  return {
    directory,
    currentFileIndex: 0,
    files: fileNames.map((fileName) => {
      return {
        fileName,
        size: getFileSizeInBytes(directory + "/" + fileName),
        progress: 0,
      };
    }),
    zipFileName,
    zipSizeOnLastCompletedEntry: 0,
    ready: false,
  };
};
