const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const StreamZip = require("node-stream-zip");

const config = require("../local.config.json");

router.post("/", function(req, res) {
  console.log("req", req);
  if (!config.jwtSecret) {
    return res.status(500).send("No JWT secret has been set for zip-service\n");
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send("No files were uploaded\n");
  }

  if (!req.body["jwt"]) {
    return res.status(400).send("JSON web token not provided\n");
  }

  const jwtValue = req.body["jwt"];

  jwt.verify(jwtValue, config.jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(400).send("Invalid JSON web token\n");
    }

    console.log("decoded jwt", decoded);

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

    zip.on("ready", () => {
      console.log("Entries read: " + zip.entriesCount);
      for (const entry of Object.values(zip.entries())) {
        const desc = entry.isDirectory ? "directory" : `${entry.size} bytes`;
        console.log(`Entry ${entry.name}: ${desc}`);
      }
      zip.close();
    });

    res.send("File uploaded\n");
  });
});

module.exports = router;
