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
const config = __importStar(require("../local.config.json"));
exports.router = express_1.default.Router();
exports.router.get("/:file", function (req, res) {
    if (!req.session.zipData) {
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
            error: false,
        };
        const file = fs.readFileSync(config.zipDir + "/" + req.params.file, "binary");
        res.setHeader("Content-Length", file.length);
        res.setHeader("content-disposition", "attachment; filename=" + req.params.file);
        res.write(file, "binary");
        res.end();
    }
    catch (error) {
        res.statusCode = 404;
        res.send("File not found");
        return;
    }
});
//# sourceMappingURL=download.js.map