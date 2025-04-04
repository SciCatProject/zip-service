import express from "express";
import * as fs from "fs";
import { config } from "../common/config";
import archiver from "archiver";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

/* POST zip */
/**
 * Request zipping of files. Require directory:string and files:string[] in the request body
 */
router.post("/", async (req, res) => {
  const bodyDirectory = req.body.directory;
  const bodyFileNames = req.body.files;
  const datasetId = req.body.dataset;

  const absoluteFileNames = transformPaths(bodyDirectory, bodyFileNames);
  logger.logInfo("Request has been submitted ", {
    fileNames: absoluteFileNames,
  });

  const { hasAccess, statusCode, error, fileNames } = await hasFileAccess(
    req,
    absoluteFileNames,
    datasetId
  );

  if (!hasAccess) {
    logger.logError("Error: ", { statusCode, error });

    return res.render("error", { statusCode, error });
  }
  try {
    const zipFileName = uuidv4() + "_" + new Date().getTime() + ".zip";

    logger.logInfo("Zip file name : " + zipFileName, {});
    req.session.zipData = initSession(absoluteFileNames, zipFileName, datasetId);
    res.render("zipping", { total: fileNames.length, zipFileName });
    if (!fs.existsSync(config.zipDir)) {
      fs.mkdirSync(config.zipDir);
    }
    const fileStream = fs.createWriteStream(config.zipDir + "/" + zipFileName);
    // **
    // Compression levels
    // #define Z_NO_COMPRESSION         0
    // #define Z_BEST_SPEED             1
    // #define Z_BEST_COMPRESSION       9
    // #define Z_DEFAULT_COMPRESSION  (-1)
    // **
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
      req.session.zipData.files[req.session.zipData.currentFileIndex].progress = 1;
      req.session.zipData.currentFileIndex += 1;
      req.session.zipData.zipSizeOnLastCompletedEntry = getFileSizeInBytes(
        config.zipDir + "/" + zipFileName
      );
      req.session.save();
    });
    archive.pipe(fileStream);
    try {
      fileNames.map((fileName: string) => {
        const directory = path.dirname(fileName);
        if (fs.existsSync(directory)) {
          archive.file(fileName, { name: fileName });
        }
      });
    } catch (error) {
      logger.logError("Failed zipping " + absoluteFileNames, {});
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
  const { currentFileIndex, ready, files, zipFileName, zipSizeOnLastCompletedEntry } =
    req.session.zipData;
  const zipSize = getFileSizeInBytes(config.zipDir + "/" + zipFileName);
  if (ready || currentFileIndex === files.length) {
    return res.send(req.session.zipData);
  }
  const bytesForCurrentFile = zipSize - zipSizeOnLastCompletedEntry;
  const fraction = bytesForCurrentFile / files[currentFileIndex].size;
  req.session.zipData.files[currentFileIndex].progress = Math.min(fraction, 1);
  return res.send(req.session.zipData);
});

const transformPaths = (directory: string, fileNames: string[]) => {
  const absoluteFileNames = fileNames.map((fileName) =>
    path.isAbsolute(fileName) ? path.join(".", fileName) : path.join(directory, fileName)
  );

  return absoluteFileNames;
};
const getFileSizeInBytes = (filename: string) => {
  try {
    const stats = fs.statSync(filename);
    return stats.size;
  } catch (err) {
    logger.logError("Error getting file size", { err });
    return 0;
  }
};

const initSession = (
  absoluteFileNames: string[],
  zipFileName: string,
  datasetId: string
): Global.ZipData => ({
  currentFileIndex: 0,
  files: absoluteFileNames.map((fileName) => ({
    fileName,
    size: getFileSizeInBytes(fileName),
    progress: 0,
  })),
  zipFileName,
  zipSizeOnLastCompletedEntry: 0,
  ready: false,
  datasetId,
});
