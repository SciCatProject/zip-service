import express from "express";
import * as fs from "fs";
import archiver from "archiver";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

/* POST zip */
router.post("/", async function (req: express.Request, res: express.Response) {
  const bodyDirectory = req.body.directory;
  const bodyFileNames = req.body.files;
  const datasetId = req.body.dataset;

  const absoluteFileNames = transformPaths(bodyDirectory, bodyFileNames);
  logger.logInfo("Request has been submitted", {
    fileNames: absoluteFileNames,
  });

  const { hasAccess, statusCode, error, fileNames } = await hasFileAccess(
    req,
    absoluteFileNames,
    datasetId
  );
  const readOpts = { highWaterMark: Math.pow(2, 20) };

  if (!hasAccess) {
    logger.logError(`error zipping file ${error}`, {});
    return res.render("error", { statusCode, error });
  }

  try {
    // **
    // Compression levels
    // #define Z_NO_COMPRESSION         0
    // #define Z_BEST_SPEED             1
    // #define Z_BEST_COMPRESSION       9
    // #define Z_DEFAULT_COMPRESSION  (-1)
    // **
    const archive = archiver("zip", {
      zlib: { level: 1 },
    });
    archive.on("error", function (err) {
      logger.logError("Error in archiver", { err });
    });

    archive.on("warning", function (err) {
      if (err.code === "ENOENT") {
        logger.logError("warning ENOENT", { err });
      } else {
        // throw error
        logger.logError("Error in archiver", { err });
      }
    });
    archive.on("end", function () {
      logger.logInfo("archiver closing", {});
      res.end();
    });

    const zipFileName = uuidv4() + "_" + new Date().getTime() + ".zip";

    res.attachment(zipFileName).type("zip");

    archive.pipe(res);

    res.on("end", function () {
      logger.logInfo("Data has been drained", {});
    });

    logger.logInfo(`zip file name ${zipFileName}`, {});

    fileNames.map((file) => {
      if (file.length == 0 || fs.lstatSync(file).isDirectory()) return;

      const read = makeReadStream(file);
      logger.logInfo(`appending ${file}`, {});
      archive.append(read, { name: path.basename(file) });
    });
    archive.finalize();
  } catch (error) {
    res.statusCode = 500;
    res.send(`The files could not be zipped ${error.message}`);
    return;
  }

  function makeReadStream(filepath: string) {
    const read = fs.createReadStream(filepath, readOpts);
    read.on("open", function () {
      logger.logInfo(`Reading ${this.path}`, {});
    });

    read.on("error", function (err) {
      res.end(err.message);
    });
    return read;
  }
});
const transformPaths = (directory: string, fileNames: string[]) => {
  const absoluteFileNames = fileNames.map((fileName) =>
    path.isAbsolute(fileName) ? fileName : path.join(directory, fileName)
  );

  return absoluteFileNames;
};
