import express from "express";
import { config } from "../common/config";
export const router = express.Router();

router.get("/", function (req, res) {
  res.render("index", {
    jwt: config.testData.jwt || "",
    directory: config.testData.directory || "",
    file0: config.testData?.files[0] || "",
    file1: config.testData?.files[1] || "",
    file2: config.testData?.files[2] || "",
  });
});
