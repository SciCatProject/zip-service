import fs = require("fs");
import path = require("path");

const configFilePath = path.resolve(__dirname, "../../config/config.json");
const configBuffer: string = fs.readFileSync(configFilePath, {
  encoding: "utf8",
  flag: "r",
});

export const config: Record<string, any> = JSON.parse(configBuffer);
