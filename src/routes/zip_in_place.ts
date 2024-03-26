import express from "express";
import * as fs from "fs";
import * as crypto from "crypto";
// import config from "../local.config.json";
import archiver from "archiver";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";

export const router = express.Router();

/* POST zip */
router.post("/", function (req: express.Request, res: express.Response) {
  const { hasAccess, statusCode, error, directory, fileNames } = hasFileAccess(
    req,
    req.body.directory,
    req.body.files
  );
  const readOpts = { highWaterMark: Math.pow(2, 20) };

  if (!hasAccess) {
    logger.logError(`error zipping file ${error}`, {});
    return res.render("error", { statusCode, error });
  }

  try {
    // res.useChunkedEncodingByDefault = true;

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

    const zipFileName =
      crypto.createHash("md5").update(directory).digest("hex") +
      "_" +
      new Date().getTime() +
      ".zip";

    res.attachment(zipFileName).type("zip");

    archive.pipe(res);

    res.on("end", function () {
      logger.logInfo("Data has been drained", {});
    });

    logger.logInfo(`zip file name ${zipFileName}`, {});

    fileNames.map((file) => {
      if (file.length == 0) return;
      const read = makeReadStream(`${req.body.directory}/${file}`);
      logger.logInfo(`appending ${file}`, {});
      archive.append(read, { name: file });
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
