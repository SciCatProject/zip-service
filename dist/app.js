"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_fileupload_1 = __importDefault(require("express-fileupload"));
const express_session_1 = __importDefault(require("express-session"));
const fs_1 = __importDefault(require("fs"));
const rimraf_1 = __importDefault(require("rimraf"));
const local_config_json_1 = __importDefault(require("./local.config.json"));
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const zip_1 = require("./routes/zip");
const download_1 = require("./routes/download");
const index_1 = require("./routes/index");
const upload_1 = require("./routes/upload");
const app = express_1.default();
app.set("views", path_1.default.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(morgan_1.default("dev"));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(cookie_parser_1.default());
app.use(express_1.default.static("public"));
app.use(express_session_1.default({
    secret: local_config_json_1.default.sessionSecret || "WARNING_UNSAFE",
    resave: false,
    saveUninitialized: true,
    name: "zip-service.sid"
}));
app.use(express_fileupload_1.default({
    useTempFiles: true,
    tempFileDir: local_config_json_1.default.zipDir,
    debug: true,
}));
app.use("/", index_1.router);
app.use("/zip", zip_1.router);
app.use("/download", download_1.router);
app.use("/upload", upload_1.router);
// Delete all zip files in config.path_to_zipped_files older than one hour.
const deleteZipFiles = () => {
    try {
        fs_1.default.readdir(local_config_json_1.default.zipDir, function (err, files) {
            files.forEach(function (file, index) {
                fs_1.default.stat(path_1.default.join(local_config_json_1.default.zipDir, file), function (err2, stat) {
                    if (err2) {
                        return console.error(err2);
                    }
                    const now = new Date().getTime();
                    const endTime = new Date(stat.ctime).getTime() + 60 * 60 * 1000;
                    if (now > endTime) {
                        return rimraf_1.default(path_1.default.join(local_config_json_1.default.zipDir, file), function (err3) {
                            if (err3) {
                                return console.error(err3);
                            }
                            console.log("successfully deleted");
                        });
                    }
                });
            });
        });
    }
    catch (error) {
        console.log("Couldn't delete files");
    }
};
setInterval(deleteZipFiles, local_config_json_1.default.zipRetentionMillis || 60 * 60 * 1000);
exports.default = app;
//# sourceMappingURL=app.js.map