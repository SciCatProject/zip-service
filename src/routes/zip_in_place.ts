import archiver from "archiver";
import express from "express";
import * as fs from "fs";
import { config } from "../common/config";
import {
  isPathInsideAllowedDataDirectory,
  validateFilenames,
} from "../common/file_utils";
import { ResolvedFile, resolvePaths } from "../common/zip_utils";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

/* POST zip */
router.post("/", async function (req: express.Request, res: express.Response) {
  const bodyFileNames = req.body.files;
  const datasetId = req.body.dataset;

  if (
    !Array.isArray(bodyFileNames) ||
    bodyFileNames.length === 0 ||
    bodyFileNames.some((f) => typeof f !== "string")
  ) {
    return res.status(400).send({
      error: "'files' must be a non-empty array of strings",
    });
  }

  if (!validateFilenames(bodyFileNames))
    return res.status(400).send({
      error: "Invalid filenames, Contains '..' ",
    });

  let absoluteFilePaths: ResolvedFile[] = [];
  if (config.directoryPathPattern) {
    // Resolve filePaths from dataset
    const authResponse = await hasFileAccess(req, bodyFileNames, datasetId);
    if (!authResponse.hasAccess) {
      logger.logError("Error accessing files", {
        statusCode: authResponse.statusCode,
        error: authResponse.error,
      });

      return res.status(authResponse.statusCode).send({
        error: authResponse.error,
      });
    }
    const resolvedPaths = resolvePaths(bodyFileNames, authResponse.variables);
    if (resolvedPaths.error) {
      return res.status(resolvedPaths.statusCode).send(resolvedPaths.error);
    }
    absoluteFilePaths = resolvedPaths.paths;
  } else {
    return res
      .status(400)
      .send("No data Directory Pattern configuration given");
  }

  const files = absoluteFilePaths;

  const readOpts = { highWaterMark: Math.pow(2, 20) };

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

    files.map((file) => {
      if (
        file.path.length == 0 ||
        !isPathInsideAllowedDataDirectory(file.path) ||
        fs.lstatSync(file.path).isDirectory()
      )
        return;

      const read = makeReadStream(file.path);
      logger.logInfo(`appending ${file.path}`, {});
      archive.append(read, { name: file.name });
    });
    archive.finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError("The files could not be zipped", { error });
    if (!res.headersSent) {
      return res.status(500).send(`The files could not be zipped ${message}`);
    }
    res.end();
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
