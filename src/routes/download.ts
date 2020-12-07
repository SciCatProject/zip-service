import express from "express";
import * as fs from "fs";
import * as config from "../local.config.json";
export const router = express.Router();

router.get("/:file", function (req, res) {
  if (!req.session.zipData){
    return res.render("error", {
      statusCode: 403,
      error: "This download link is no longer valid",
    });
  }
  if (req.session.zipData.zipFileName !== req.params.file) {
    res.statusCode = 403;
    return res.render("error", {
      statusCode: 403,
      error: "You do not have access to this file",
    });
  }
  if (!req.params.file) {
    res.statusCode = 400;
    return res.send("Missing parameter 'file'");
  }
  try {
    req.session.zipData = {
      directory: "",
      currentFileIndex: 0,
      files: [],
      zipFileName: "",
      zipSizeOnLastCompletedEntry: 0,
      ready: false,
    };
    const file = fs.readFileSync(
      config.zipDir + "/" + req.params.file,
      "binary"
    );
    res.setHeader("Content-Length", file.length);
    res.setHeader(
      "content-disposition",
      "attachment; filename=" + req.params.file
    );
    res.write(file, "binary");
    res.end();
  } catch (error) {
    res.statusCode = 404;
    res.send("File not found");
    return;
  }
});
