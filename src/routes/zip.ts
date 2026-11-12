import archiver from "archiver";
import express from "express";
import path from "path";
import * as fs from "fs";
import { config } from "../common/config";
import { validateFilenames } from "../common/file_utils";
import { ResolvedFile, resolvePaths } from "../common/zip_utils";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

router.get("/", (req, res) => {
  if (config.formViewsEnabled?.zip === false) {
    return res.status(404).render("error", {
      statusCode: 404,
      error: "Not found",
    });
  }

  res.render("zip_form", getFormDefaults());
});

/* POST zip */
/**
 * Request zipping of files. Require files:string[] in the request body
 */
router.post("/", async (req, res) => {
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

  try {
    const zipFileName = uuidv4() + "_" + new Date().getTime() + ".zip";

    logger.logInfo("Zip file name : " + zipFileName, {});
    req.session.zipData = initSession(files, zipFileName, datasetId);
    res.render("zipping", { total: files.length, zipFileName });
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
      req.session.zipData.files[req.session.zipData.currentFileIndex].progress =
        1;
      req.session.zipData.currentFileIndex += 1;
      req.session.zipData.zipSizeOnLastCompletedEntry = getFileSizeInBytes(
        config.zipDir + "/" + zipFileName,
      );
      req.session.save();
    });
    archive.pipe(fileStream);
    try {
      files.map((file) => {
        const directory = path.dirname(file.path);
        if (fs.existsSync(directory)) {
          archive.file(file.path, { name: file.name });
        }
      });
    } catch (error) {
      logger.logError("Failed zipping " + files, {});
    }
    archive.finalize();
  } catch (error) {
    res.statusCode = 500;
    res.send("The files could not be zipped");
    return;
  }
});

// Polled periodically from the zipping view. Returns current progress or resulting file name if the zipping is done
router.get("/status", (req, res) => {
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
  try {
    const stats = fs.statSync(filename);
    return stats.size;
  } catch (err) {
    logger.logError("Error getting file size", { err });
    return 0;
  }
};

const initSession = (
  files: ResolvedFile[],
  zipFileName: string,
  datasetId: string,
): Global.ZipData => ({
  currentFileIndex: 0,
  files: files.map((file) => ({
    fileName: file.name,
    size: getFileSizeInBytes(file.path),
    progress: 0,
  })),
  zipFileName,
  zipSizeOnLastCompletedEntry: 0,
  ready: false,
  datasetId,
});

function getFormDefaults() {
  return {
    jwt: config.testData.jwt || "",
    dataset: "",
    file0: config.testData?.files[0] || "",
    file1: config.testData?.files[1] || "",
    file2: config.testData?.files[2] || "",
  };
}
