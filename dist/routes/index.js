"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const local_config_json_1 = __importDefault(require("../local.config.json"));
exports.router = express_1.default.Router();
exports.router.get("/", function (req, res, next) {
    var _a, _b, _c;
    res.render("index", {
        jwt: local_config_json_1.default.testData.jwt || "",
        directory: local_config_json_1.default.testData.directory || "",
        file0: ((_a = local_config_json_1.default.testData) === null || _a === void 0 ? void 0 : _a.files[0]) || "",
        file1: ((_b = local_config_json_1.default.testData) === null || _b === void 0 ? void 0 : _b.files[1]) || "",
        file2: ((_c = local_config_json_1.default.testData) === null || _c === void 0 ? void 0 : _c.files[2]) || "",
    });
});
//# sourceMappingURL=index.js.map