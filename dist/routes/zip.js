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
const fs = __importStar(require("fs"));
const local_config_json_1 = __importDefault(require("../local.config.json"));
const archiver_1 = __importDefault(require("archiver"));
const auth_1 = require("../auth");
exports.router = express_1.default.Router();
/* POST zip */
/**
 * Request zipping of files. Require directory:string and files:string[] in the request body
 */
exports.router.post("/", (req, res) => {
    const { hasAccess, statusCode, error, directory, fileNames } = auth_1.hasFileAccess(req, req.body.directory, req.body.files);
    if (!hasAccess) {
        return res.render("error", { statusCode, error });
    }
    // TODO if sessiondata - ask if the user wants to delete it before starting a new zip
    try {
        const zipFileName = require("crypto").createHash("md5").update(directory).digest("hex") +
            "_" +
            new Date().getTime() +
            ".zip";
        req.session.zipData = initSession(directory, fileNames, zipFileName);
        res.render("zipping", { total: fileNames.length, zipFileName });
        if (!fs.existsSync(local_config_json_1.default.zipDir)) {
            fs.mkdirSync(local_config_json_1.default.zipDir);
        }
        const fileStream = fs.createWriteStream(local_config_json_1.default.zipDir + "/" + zipFileName);
        const archive = archiver_1.default("zip", {
            gzip: true,
            zlib: { level: 9 },
        });
        archive.on("error", function (err) {
            console.error("Error in archiver", err);
        });
        fileStream.on("close", function () {
            req.session.zipData.ready = true;
            req.session.save();
        });
        archive.on("entry", function () {
            req.session.zipData.files[req.session.zipData.currentFileIndex].progress = 1;
            req.session.zipData.currentFileIndex += 1;
            req.session.zipData.zipSizeOnLastCompletedEntry = getFileSizeInBytes(local_config_json_1.default.zipDir + "/" + zipFileName);
            req.session.save();
        });
        archive.pipe(fileStream);
        try {
            fileNames.map((fileName) => {
                if (fs.existsSync(directory)) {
                    archive.file(directory + "/" + fileName, { name: fileName });
                }
            });
        }
        catch (error) {
            console.log("Failed zipping " + directory);
        }
        archive.finalize();
    }
    catch (error) {
        res.statusCode = 500;
        res.send("The files could not be zipped");
        return;
    }
});
// Polled periodically from the zipping view. Returns current progress or resulting file name if the zipping is done
exports.router.get("/", (req, res) => {
    const { currentFileIndex, ready, files, zipFileName, zipSizeOnLastCompletedEntry, } = req.session.zipData;
    const zipSize = getFileSizeInBytes(local_config_json_1.default.zipDir + "/" + zipFileName);
    console.log({ currentFileIndex, files, ready, zipSizeOnLastCompletedEntry, zipSize });
    if (ready || currentFileIndex === files.length) {
        return res.send(req.session.zipData);
    }
    const bytesForCurrentFile = zipSize - zipSizeOnLastCompletedEntry;
    const fraction = bytesForCurrentFile / files[currentFileIndex].size;
    req.session.zipData.files[currentFileIndex].progress = Math.min(fraction, 1);
    return res.send(req.session.zipData);
});
const getFileSizeInBytes = (filename) => {
    const stats = fs.statSync(filename);
    return stats.size;
};
const initSession = (directory, fileNames, zipFileName) => {
    return {
        directory,
        currentFileIndex: 0,
        files: fileNames.map((fileName) => {
            return {
                fileName,
                size: getFileSizeInBytes(directory + "/" + fileName),
                progress: 0,
            };
        }),
        zipFileName,
        zipSizeOnLastCompletedEntry: 0,
        ready: false,
    };
};
//# sourceMappingURL=zip.js.map