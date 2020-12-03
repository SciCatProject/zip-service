import express from "express";
import * as fs from "fs";
import config from "../local.config.json";
import jwt from "jsonwebtoken";
import archiver from "archiver";
import { hasFileAccess } from "../auth";

const ENTRY_CURRENT = "CURRENT";
const ENTRY_NBR_OF_FILES = "TOTAL";
const ENTRY_FILENAME = "FILENAME";
const ZIP_SIZE_AFTER_LAST_COMPLETED_FILE = "ZIP_SIZE_AFTER_LAST_COMPLETED_FILE";
const SIZE_OF_CURRENT_FILE = "SIZE_OF_CURRENT_FILE";
const db: any = new Object();

export const router = express.Router();

/* POST zip */
router.post("/", function (req, res) {
  const { hasAccess, statusCode, error, directory, fileNames } = hasFileAccess(
    req
  );
  if (!hasAccess){
    return res.status(statusCode).send(error);
  }
  try {
    const zipFileName =
      require("crypto").createHash("md5").update(directory).digest("hex") +
      "_" +
      new Date().getTime() +
      ".zip";
    initEntry(zipFileName, fileNames.length);
    res.render("zipping", { total: fileNames.length, file: zipFileName });
    zipFiles(directory, fileNames, zipFileName);
  } catch (error) {
    res.statusCode = 500;
    res.send("The files could not be zipped");
    return;
  }
});

const zipFiles = (path: string, files: string[], zipFileName: string) => {
  const fileStream = fs.createWriteStream(config.zipDir + "/" + zipFileName);
  const archive = archiver("zip", {
    gzip: true,
    zlib: { level: 9 },
  });
  archive.on("error", function (err) {
    throw err;
  });
  fileStream.on("close", function () {
    setDone(zipFileName, "/download/" + zipFileName);
  });
  archive.on("entry", function () {
    incrementCurrent(zipFileName);
  });
  archive.pipe(fileStream);
  try {
    files.map((file) => zipSingleFile(path, file, archive, zipFileName));
  } catch (error) {
    console.log("Failed zipping " + path);
  }
  archive.finalize();
};

const zipSingleFile = (
  path: string,
  file: string,
  archive: archiver.Archiver,
  zipFileName: string
) => {
  try {
    db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE] = getFilesizeInBytes(
      config.zipDir + "/" + zipFileName
    );
    db[zipFileName][SIZE_OF_CURRENT_FILE] = getFilesizeInBytes(
      path + "/" + file
    );
    fs.existsSync(path + "/" + file)
      ? archive.file(path + "/" + file, { name: file })
      : null;
  } catch (err) {
    console.log(err);
  }
};

//Polled periodically from the zipping view. Returns current progress or resulting file name if the zipping is done
router.get("/polling/:file", function (req, res, next) {
  if (!req.params.file) {
    res.statusCode = 400;
    res.send("Invalid file");
    return;
  }
  const fileName = db[req.params.file][ENTRY_FILENAME];
  if (fileName && fileName !== "") {
    res.send(fileName);
  } else {
    res.send(
      db[req.params.file][ENTRY_CURRENT] +
        getFractionalProgress(req.params.file) +
        ""
    );
  }
});

const getFilesizeInBytes = (filename: string) => {
  const stats = fs.statSync(filename);
  return stats.size;
};

//returns an estimation of the progress on the file current being zipped. Return value in range [0, 1]
const getFractionalProgress = (zipFileName: string) => {
  const zipSize = getFilesizeInBytes(config.zipDir + "/" + zipFileName);
  const bytesForCurrentFile =
    zipSize - db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE];
  const fraction = bytesForCurrentFile / db[zipFileName][SIZE_OF_CURRENT_FILE];
  return fraction;
};

const isAuthorized = (
  groups: string[],
  path: string,
  files: string[],
  facility: string
) => {
  if (facility === "maxiv") {
    return (
      groups.filter((group) => group.trim() && path.indexOf(group) > -1)
        .length > 0
    );
  }
  return true;
};

const incrementCurrent = (file: string) => {
  db[file][ENTRY_CURRENT]++;
};

const initEntry = (zipFileName: string, nbrFiles: number) => {
  db[zipFileName] = {};
  db[zipFileName][ENTRY_CURRENT] = 0;
  db[zipFileName][ENTRY_NBR_OF_FILES] = nbrFiles;
  db[zipFileName][ENTRY_FILENAME] = "";
  db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE] = 0;
  db[zipFileName][SIZE_OF_CURRENT_FILE] = 0;
};

const setDone = (id: string, filename: string) => {
  db[id][ENTRY_CURRENT] = db[id][ENTRY_NBR_OF_FILES];
  db[id][ENTRY_FILENAME] = filename;
};
