import express from "express";
import { config } from "../common/config";
export const router = express.Router();

router.get("/", function (req, res) {
  if (config.formViewsEnabled?.index === false) {
    return res.status(404).render("error", {
      statusCode: 404,
      error: "Not found",
    });
  }

  res.render("index", {
    jwt: config.testData.jwt || "",
    dataset: "",
    file0: config.testData?.files[0] || "",
    file1: config.testData?.files[1] || "",
    file2: config.testData?.files[2] || "",
    zipFormEnabled: config.formViewsEnabled?.zip !== false,
    fileFormEnabled: config.formViewsEnabled?.file !== false,
  });
});
