const express = require("express");
const router = express.Router();

const fs = require("fs");
const jwt = require("jsonwebtoken");
const path = require("path");
const StreamZip = require("node-stream-zip");

const config = require("../local.config.json");

const homePath = "/nfs/groups/beamlines/dram";

router.post("/", function(req, res) {
  //   console.log("req", req);
  const data = req.body;

  if (!config.jwtSecret) {
    return res.status(500).send("No JWT secret has been set for zip-service\n");
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send("No files were uploaded\n");
  }

  if (!data["jwt"]) {
    return res.status(400).send("JSON web token not provided\n");
  }

  const jwtValue = data["jwt"];

  jwt.verify(jwtValue, config.jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).send("Invalid JSON web token\n");
    }

    console.log("decoded jwt", decoded);

    let saveDir;
    if (data["dir"]) {
      if (data["dir"].indexOf("..") > -1 || data["dir"].indexOf("/") > -1) {
        return res
          .status(403)
          .send(`Directory names containing '..' or '/' are not allowed`);
      }
      saveDir = data["dir"];
    } else {
      saveDir = generateDirName();
      const homeDir = fs.readdirSync(homePath);
      if (!homeDir.includes(saveDir)) {
        fs.mkdirSync(path.join(homePath, saveDir));
      }
    }

    console.log("saveDir", saveDir);

    const savePath = path.join(homePath, saveDir);
    console.log("savePath", savePath);

    const zipfile = path.join(
      "/home/node/app",
      req.files["zipfile"].tempFilePath
    );
    console.log("zipfilePath", zipfile);

    const zip = new StreamZip({
      file: zipfile,
      storeEntries: true
    });

    zip.on("error", err => {
      return res.status(500).send("Unable to read zip file\n");
    });

    let entries;

    zip.on("ready", () => {
      const saveDir = fs.readdirSync(savePath);
      entries = Object.keys(zip.entries());
      console.log("entries", entries);
      const duplicates = entries.filter(entry => saveDir.includes(entry));
      console.log("duplicates", duplicates);
      if (duplicates.length > 0) {
        zip.close();
        return res
          .status(500)
          .send(
            `The file(s) ${duplicates} already exists in the chosen directory. Please choose another directory or rename the conflicting file(s).`
          );
      } else {
        zip.extract(null, savePath, (err, count) => {
          if (err) {
            return res.status(500).send("Unable to extraxt files\n");
          }
          console.log(`Extracted ${count} files`);
          zip.close();

          return res.status(200).send({
            message: "Upload successful",
            files: entries,
            location: savePath
          });
        });
      }
    });
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
