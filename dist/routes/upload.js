"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
exports.router = express_1.default.Router();
const fs = __importStar(require("fs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const path_1 = __importDefault(require("path"));
const node_stream_zip_1 = __importDefault(require("node-stream-zip"));
const local_config_json_1 = __importDefault(require("../local.config.json"));
const homePath = local_config_json_1.default.dramDirectory;
exports.router.post("/", function (req, res) {
    const data = req.body;
    if (!local_config_json_1.default.jwtSecret) {
        const message = "No JWT secret has been set for zip-service\n";
        console.log("WARNING", message);
        return res.status(500).send(message);
    }
    if (!req.files || Object.keys(req.files).length === 0) {
        const message = "No files were uploaded\n";
        console.log("INFO", message);
        return res.status(400).send(message);
    }
    if (!data.jwt) {
        const message = "JSON web token not provided\n";
        console.log("INFO", message);
        return res.status(400).send(message);
    }
    try {
        jsonwebtoken_1.default.verify(data.jwt, local_config_json_1.default.jwtSecret);
    }
    catch (err) {
        console.error("ERROR", err);
        return res.status(400).send("Invalid JSON web token\n");
    }
    let saveDir;
    if (data.dir) {
        if (data.dir.indexOf("..") > -1 || data.dir.indexOf("/") > -1) {
            const message = "Directory names containing '..' or '/' are not allowed\n";
            console.log("WARNING", message);
            return res.status(400).send(message);
        }
        saveDir = data.dir;
    }
    else {
        do {
            saveDir = generateDirName();
            const homeDir = fs.readdirSync(homePath);
            if (!homeDir.includes(saveDir)) {
                fs.mkdirSync(path_1.default.join(homePath, saveDir));
                break;
            }
            else {
                continue;
            }
        } while (true);
    }
    const savePath = path_1.default.join(homePath, saveDir);
    const zipfile = path_1.default.join("/home/node/app", req.files.zipfile.tempFilePath);
    const zip = new node_stream_zip_1.default({
        file: zipfile,
        storeEntries: true,
    });
    zip.on("error", (err) => {
        console.error("ERROR", err);
        return res.status(500).send("Unable to read zip file\n");
    });
    zip.on("extract", (entry, file) => {
        console.log("INFO", `Extracted ${entry.name} to ${file}`);
    });
    zip.on("ready", () => {
        const entries = zip.entries();
        const dirContent = fs.readdirSync(savePath);
        const duplicates = entries
            .map((entry) => entry.name)
            .filter((fileName) => dirContent.includes(fileName));
        if (duplicates.length > 0) {
            zip.close();
            const message = `The file(s) ${duplicates} already exists in directory ${saveDir}. ` +
                "Please choose another directory or rename the conflicting file(s).\n";
            console.log("WARNING", message);
            return res.status(500).send(message);
        }
        else {
            zip.extract(null, savePath, (err) => {
                if (err) {
                    console.error("ERROR", err);
                    return res.status(500).send("Unable to extraxt files\n");
                }
                console.log("INFO", `Extracted the file(s) from ${req.files.zipfile.name} to ${savePath}`);
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
//# sourceMappingURL=upload.js.map