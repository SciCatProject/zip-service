const express = require("express");
const router = express.Router();

const fs = require("fs");
const jwt = require("jsonwebtoken");
const path = require("path");
const StreamZip = require("node-stream-zip");

const config = require("../local.config.json");

const homePath = config.dram_directory;

router.post("/", function(req, res) {
  const data = req.body;

  if (!config.jwtSecret) {
    const message = "No JWT secret has been set for zip-service\n";
    console.log("WARNING", message);
    return res.status(500).send(message);
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    const message = "No files were uploaded\n";
    console.log("INFO", message);
    return res.status(400).send(message);
  }

  if (!data["jwt"]) {
    const message = "JSON web token not provided\n";
    console.log("INFO", message);
    return res.status(400).send(message);
  }

  try {
    jwt.verify(data["jwt"], config.jwtSecret);
  } catch (err) {
    console.error("ERROR", err);
    return res.status(400).send("Invalid JSON web token\n");
  }

  let saveDir;
  if (data["dir"]) {
    if (data["dir"].indexOf("..") > -1 || data["dir"].indexOf("/") > -1) {
      const message =
        "Directory names containing '..' or '/' are not allowed\n";
      console.log("WARNING", message);
      return res.status(400).send(message);
    }
    saveDir = data["dir"];
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
  const zipfile = path.join(
    "/home/node/app",
    req.files["zipfile"].tempFilePath
  );

  const zip = new StreamZip({
    file: zipfile,
    storeEntries: true
  });

  zip.on("error", err => {
    console.error("ERROR", err);
    return res.status(500).send("Unable to read zip file\n");
  });

  zip.on("extract", (entry, file) => {
    console.log("INFO", `Extracted ${entry.name} to ${file}`);
  });

  let entries;

  zip.on("ready", () => {
    entries = Object.values(zip.entries());
    const dirContent = fs.readdirSync(savePath);
    const duplicates = entries
      .map(entry => entry.name)
      .filter(fileName => dirContent.includes(fileName));

    if (duplicates.length > 0) {
      zip.close();

      const message =
        `The file(s) ${duplicates} already exists in directory ${saveDir}. ` +
        "Please choose another directory or rename the conflicting file(s).\n";
      console.log("WARNING", message);
      return res.status(500).send(message);
    } else {
      zip.extract(null, savePath, (err, count) => {
        if (err) {
          console.error("ERROR", err);
          return res.status(500).send("Unable to extraxt files\n");
        }

        console.log(
          "INFO",
          `Extracted ${count} file(s) from ${req.files["zipfile"].name} to ${savePath}`
        );
        zip.close();

        return res.status(200).send({
          message: "Upload successful",
          files: entries.map(({ name, size }) => ({ name, size })),
          sourceFolder: savePath
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

module.exports = router;
