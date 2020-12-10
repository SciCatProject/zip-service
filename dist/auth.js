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
exports.hasFileAccess = void 0;
const local_config_json_1 = __importDefault(require("./local.config.json"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs = __importStar(require("fs"));
const hasFileAccess = (req, directory, fileNames) => {
    const { jwtSecret, facility } = local_config_json_1.default;
    if (!jwtSecret) {
        return {
            hasAccess: false,
            statusCode: 500,
            error: "No JWT secret has been set for zip-service",
            directory: undefined,
            fileNames: [],
        };
    }
    let jwtDecoded;
    try {
        jwtDecoded = jsonwebtoken_1.default.verify(req.body.jwt || req.cookies.jwt || req.query.jwt, jwtSecret);
    }
    catch (e) {
        return {
            hasAccess: false,
            statusCode: 401,
            error: "Invalid or expired JWT",
            directory: undefined,
            fileNames: [],
        };
    }
    const authRequest = {
        jwt: jwtDecoded,
        endpoint: req.originalUrl,
        httpMethod: req.method,
        directory,
        fileNames,
    };
    if (!authRequest.directory) {
        return {
            hasAccess: false,
            statusCode: 400,
            error: "'directory' was not specified",
            directory: undefined,
            fileNames: [],
        };
    }
    if (!authRequest.fileNames || authRequest.fileNames.length === 0) {
        return {
            hasAccess: false,
            statusCode: 400,
            error: "'fileNames' was not specified",
            directory: undefined,
            fileNames: [],
        };
    }
    if (!fs.existsSync(authRequest.directory)) {
        return {
            hasAccess: false,
            statusCode: 404,
            error: `The directory ${authRequest.directory} does not exist`,
            directory: undefined,
            fileNames: [],
        };
    }
    const groups = jwtDecoded.groups;
    if (!groups) {
        return {
            hasAccess: false,
            statusCode: 400,
            error: "The jwt does not contain field 'groups'",
            directory: undefined,
            fileNames: [],
        };
    }
    // Evaluate access rights based on institution specific logic
    switch (facility) {
        case "maxiv": {
            return authMAXIV(authRequest);
        }
        default:
            return {
                hasAccess: true,
                statusCode: 200,
                directory: authRequest.directory,
                fileNames: authRequest.fileNames,
            };
    }
};
exports.hasFileAccess = hasFileAccess;
const authMAXIV = (authRequest) => {
    const valid = authRequest.jwt.groups.filter((group) => group.trim() && authRequest.directory.indexOf(group) > -1).length > 0;
    return {
        hasAccess: valid,
        statusCode: valid ? 200 : 403,
        error: valid ? "" : "You do not have access to this resource",
        directory: valid ? authRequest.directory : undefined,
        fileNames: valid ? authRequest.fileNames : [],
    };
};
//# sourceMappingURL=auth.js.map