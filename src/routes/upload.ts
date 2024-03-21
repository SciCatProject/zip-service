import express from "express";
export const router = express.Router();

import * as fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import StreamZip from "node-stream-zip";
import { config } from "../common/config";
import { logger } from "@user-office-software/duo-logger";

const homePath = config.dramDirectory;

router.post("/", function (req, res) {
  const data = req.body;

  if (!config.jwtSecret) {
    const message = "No JWT secret has been set for zip-service\n";
    logger.logWarn(message, {});

    return res.status(500).send(message);
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    const message = "No files were uploaded\n";
    logger.logInfo(message, {});

    return res.status(400).send(message);
  }

  if (Array.isArray(req.files.zipfile)) {
    const message = "Upload only supports a single zip file\n";
    logger.logError(message, {});

    return res.status(400).send(message);
  }

  if (!data.jwt) {
    const message = "JSON web token not provided\n";
    logger.logInfo(message, {});

    return res.status(400).send(message);
  }

  try {
    jwt.verify(data.jwt, config.jwtSecret);
  } catch (err) {
    logger.logError("An error occured while verifying token ", err);
    return res.status(400).send("Invalid JSON web token\n");
  }

  let saveDir: string;
  if (data.dir) {
    if (data.dir.indexOf("..") > -1 || data.dir.indexOf("/") > -1) {
      const message =
        "Directory names containing '..' or '/' are not allowed\n";
      logger.logWarn(message, {});
      return res.status(400).send(message);
    }
    saveDir = data.dir;
  } else {
    do {
      saveDir = generateDirName();
      const homeDir = fs.readdirSync(homePath);
      if (!homeDir.includes(saveDir)) {
        fs.mkdirSync(path.join(homePath, saveDir));
        break;
      } else {
        continue;
      }
    } while (true);
  }

  const savePath = path.join(homePath, saveDir);
  const zipfile = path.join("/home/node/app", req.files.zipfile.tempFilePath);
  const zipfileName = req.files.zipfile.name;

  const zip = new StreamZip({
    file: zipfile,
    storeEntries: true,
  });

  zip.on("error", (err) => {
    logger.logError("An error occured", { err });
    return res.status(500).send("Unable to read zip file\n");
  });

  zip.on("extract", (entry, file) => {
    logger.logWarn(`Extracted ${entry.name} to ${file}`, {});
  });

  zip.on("ready", () => {
    const entries = zip.entries();
    const dirContent = fs.readdirSync(savePath);
    const duplicates = entries
      .map((entry) => entry.name)
      .filter((fileName) => dirContent.includes(fileName));

    if (duplicates.length > 0) {
      zip.close();

      const message =
        `The file(s) ${duplicates} already exists in directory ${saveDir}. ` +
        "Please choose another directory or rename the conflicting file(s).\n";
      logger.logWarn(message, {});
      return res.status(500).send(message);
    } else {
      zip.extract(null, savePath, (err: Error) => {
        if (err) {
          logger.logError("An error occured", { err });
          return res.status(500).send("Unable to extraxt files\n");
        }

        logger.logInfo(
          `Extracted the file(s) from ${zipfileName} to ${savePath}`,
          {}
        );
        zip.close();

        return res.status(200).send({
          message: "Upload successful",
          files: entries.map(({ name, size }) => ({ name, size })),
          sourceFolder: savePath,
        });
      });
    }
  });
});

function generateDirName() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const charactersLength = characters.length;
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
