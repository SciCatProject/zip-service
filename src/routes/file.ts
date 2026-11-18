import express from "express";
import * as fs from "fs";
import { pipeline } from "stream";
import { config } from "../common/config";
import {
  FileLink,
  FileResolution,
  validateFilenames,
  isPathInsideAllowedDataDirectory,
  resolveFilePath,
  VariableValue,
} from "../common/file_utils";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getPublicOrigin, getRouteBasePath } from "../common/routing";

export const router = express.Router();

const fileLinks = new Map<string, FileLink>();
const fileLinkRetentionMillis =
  config.fileLinkRetentionMillis || 60 * 60 * 1000;

const HDF_EXTENSIONS = [".h5", ".hdf5", ".hdf", ".nxs"];

router.get("/", (req, res) => {
  if (config.formViewsEnabled?.file === false) {
    return res.status(404).render("error", {
      statusCode: 404,
      error: "Not found",
    });
  }

  res.render("file_form", getFormDefaults());
});

router.post("/", async (req, res) => {
  cleanupExpiredFileLinks();

  const bodyFileNames = getBodyFileNames(req.body);

  if (!Array.isArray(bodyFileNames) || bodyFileNames.length !== 1) {
    return res.status(400).send({
      error: "Exactly one file must be specified",
    });
  }

  if (typeof bodyFileNames[0] !== "string") {
    return res.status(400).send({
      error: "File must be a string",
    });
  }

  const bodyFileName = bodyFileNames[0];

  if (!validateFilenames([bodyFileName])) {
    return res.status(400).send({
      error: "Invalid filename, Contains '..' ",
    });
  } else if (!config.directoryPathPattern) {
    return res.status(400).send({
      error: "directoryPathPattern must be specified",
    });
  }

  const fileAction =
    typeof req.body.fileAction === "string" ? req.body.fileAction : "";

  if (fileAction === "Open" && !isHdfFile(bodyFileName)) {
    return renderUnsupportedOpen(res, bodyFileName);
  }

  return createFileLink(req, res);
});

router.head("/download", (req, res) => {
  return sendFileHead(req, res, "attachment");
});

router.head("/stream", (req, res) => {
  return sendFileHead(req, res, "inline");
});

router.get("/open", (req, res) => {
  return openFile(req, res);
});

router.get("/download", (req, res) => {
  return sendFile(req, res, "attachment");
});

router.get("/stream", (req, res) => {
  return sendFile(req, res, "inline");
});

function sendFile(
  req: express.Request,
  res: express.Response,
  disposition: "attachment" | "inline",
) {
  const fileData = getFileLink(req);
  if (!fileData) {
    return res.status(403).send("This file link is no longer valid");
  }

  return sendResolvedFile(
    fileData.filepath,
    res,
    disposition,
    req.headers.range,
  );
}

function sendFileHead(
  req: express.Request,
  res: express.Response,
  disposition: "attachment" | "inline",
) {
  const fileData = getFileLink(req);
  if (!fileData) {
    return res.status(403).end();
  }
  const fileStat = getFileStat(fileData.filepath);
  if (!fileStat || fileStat.isDirectory()) {
    return res.status(404).end();
  }

  return sendResolvedFileHead(fileData.filepath, res, disposition);
}

function openFile(req: express.Request, res: express.Response) {
  const fileData = getFileLink(req);
  if (!fileData) {
    return res.status(403).send("This file link is no longer valid");
  }

  if (!isHdfFile(fileData.filename)) {
    return renderUnsupportedOpen(res, fileData.filename);
  }

  const streamUrl = createFileAccessUrl("stream", fileData.token, true);
  if (!streamUrl) {
    return res.status(500).send("Service public origin is not configured");
  }

  const hdfUrl = createHdfViewUrl(streamUrl, fileData.filename);
  if (!hdfUrl) {
    return res.status(500).send("HDF View service URL is not configured");
  }

  return res.redirect(303, hdfUrl);
}

async function createFileLink(req: express.Request, res: express.Response) {
  const datasetId = req.body.dataset || req.body.datasetId;
  const filename = getBodyFileNames(req.body)[0] as string;
  const fileAction =
    typeof req.body.fileAction === "string" ? req.body.fileAction : "";

  const authResponse = await hasFileAccess(req, [filename], datasetId);
  if (!authResponse.hasAccess) {
    logger.logError("Error accessing file", {
      statusCode: authResponse.statusCode,
      error: authResponse.error,
    });

    return res.status(authResponse.statusCode).send({
      error: authResponse.error,
    });
  }

  return createResolvedFileLink(
    req,
    res,
    datasetId,
    filename,
    authResponse.variables ?? {},
    fileAction,
  );
}

function createResolvedFileLink(
  req: express.Request,
  res: express.Response,
  datasetId: string,
  filename: string,
  variables?: Record<string, VariableValue>,
  fileAction = "",
) {
  const resolution: FileResolution = resolveFilePath(filename, variables);

  if (resolution.error) {
    return res.status(resolution.statusCode).send({
      error: resolution.error,
    });
  }

  const resolvedFilename = resolution.filename;
  const resolvedFolder = resolution.folders?.[0];

  if (!resolvedFilename || !resolvedFolder) {
    return res.status(500).send({
      error: "File path could not be resolved",
    });
  }
  const filepath = path.resolve(resolvedFolder, resolvedFilename);
  const fileStat = getFileStat(filepath);

  if (!fileStat || fileStat.isDirectory()) {
    return res.status(404).send({
      error: "File not found",
    });
  }

  const token = uuidv4();
  const canonicalFilepath = fs.realpathSync(filepath);

  fileLinks.set(token, {
    filename: resolvedFilename,
    filepath: canonicalFilepath,
    datasetId,
    token,
    expiresAt: Date.now() + fileLinkRetentionMillis,
  });

  const downloadUrl = createFileAccessUrl("download", token);
  const streamUrl = createFileAccessUrl("stream", token);
  const openUrl = createFileAccessUrl("open", token);

  if (fileAction === "Download") {
    return res.redirect(303, downloadUrl);
  }

  if (fileAction === "Open") {
    return res.redirect(303, openUrl);
  }

  return res.status(201).send({
    fileName: resolvedFilename,
    size: fileStat.size,
    expiresAt: new Date(Date.now() + fileLinkRetentionMillis).toISOString(),
    downloadUrl,
    streamUrl,
    openUrl,
  });
}

function sendResolvedFile(
  absoluteFileName: string,
  res: express.Response,
  disposition: "attachment" | "inline",
  rangeHeader?: string,
) {
  const fileStat = getFileStat(absoluteFileName);
  if (!fileStat || fileStat.isDirectory()) {
    return res.status(404).send("File not found");
  }

  const fileName = path.basename(absoluteFileName);
  const contentType = getContentType(fileName);
  const range = parseRange(rangeHeader, fileStat.size);

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    getContentDisposition(disposition, fileName),
  );

  if (!range) {
    res.setHeader("Content-Length", fileStat.size);

    return pipeFile(absoluteFileName, res);
  }

  if (!range.valid) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${fileStat.size}`);

    return res.end();
  }

  const { start, end } = range;
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
  res.setHeader("Content-Length", end - start + 1);

  return pipeFile(absoluteFileName, res, { start, end });
}

function sendResolvedFileHead(
  absoluteFileName: string,
  res: express.Response,
  disposition: "attachment" | "inline",
) {
  const fileStat = getFileStat(absoluteFileName);
  if (!fileStat || fileStat.isDirectory()) {
    return res.status(404).end();
  }

  const fileName = path.basename(absoluteFileName);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", getContentType(fileName));
  res.setHeader(
    "Content-Disposition",
    getContentDisposition(disposition, fileName),
  );
  res.setHeader("Content-Length", fileStat.size);

  return res.status(200).end();
}

function createFileAccessUrl(
  action: "download" | "stream" | "open",
  token: string,
  absolute = false,
) {
  const pathname = `/file/${action}?token=${token}`;
  const prefixedPath = `${getRouteBasePath()}${pathname}`;

  if (!absolute) {
    return prefixedPath;
  }

  const origin = getPublicOrigin();
  return origin ? `${origin}${prefixedPath}` : null;
}

function createHdfViewUrl(fileUrl: string, filename?: string) {
  if (!config.hdfViewServiceUrl) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(config.hdfViewServiceUrl);
  } catch {
    return null;
  }
  url.searchParams.set("url", fileUrl);
  if (filename) {
    url.searchParams.set("label", filename);
  }
  return url.toString();
}

function getFileLink(req: express.Request) {
  cleanupExpiredFileLinks();

  const token = typeof req.query.token === "string" ? req.query.token : "";
  const fileData = fileLinks.get(token);
  if (
    !fileData ||
    fileData.token !== token ||
    Date.now() > fileData.expiresAt
  ) {
    return null;
  }

  return fileData;
}

function cleanupExpiredFileLinks() {
  const now = Date.now();

  for (const [id, fileLink] of fileLinks) {
    if (now > fileLink.expiresAt) {
      fileLinks.delete(id);
    }
  }
}

function getBodyFileNames(body: Record<string, unknown>) {
  if (Array.isArray(body.files)) {
    return body.files;
  }
  if (body.fileName) {
    return [body.fileName];
  }
  if (body.file) {
    return [body.file];
  }
  return [];
}

function getFileStat(fileName: string) {
  try {
    if (!isPathInsideAllowedDataDirectory(fileName)) {
      return null;
    }
    return fs.statSync(fileName);
  } catch (err) {
    logger.logError("Error getting file stat", { err });

    return null;
  }
}

function isHdfFile(fileName: string) {
  return HDF_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

function renderUnsupportedOpen(res: express.Response, fileName: string) {
  res.statusCode = 400;
  return res.render("error", {
    statusCode: 400,
    error: `Cannot open "${path.basename(fileName)}": only ${HDF_EXTENSIONS.join(", ")} files can be opened`,
  });
}

function getContentType(fileName: string) {
  if (isHdfFile(fileName)) {
    return "application/x-hdf5";
  }
  return "application/octet-stream";
}

function getContentDisposition(
  disposition: "attachment" | "inline",
  fileName: string,
) {
  const safeFileName = fileName.replace(/[\r\n"\\]/g, "_");
  return `${disposition}; filename="${safeFileName}"`;
}

function pipeFile(
  fileName: string,
  res: express.Response,
  options?: { start: number; end: number },
) {
  pipeline(fs.createReadStream(fileName, options), res, (err) => {
    if (!err) return;
    logger.logError("Error reading file stream", { err });
    if (!res.headersSent) {
      res.status(500).send("Unable to read file");
    } else if (!res.writableEnded) {
      res.end();
    }
  });
}

function parseRange(rangeHeader: string | undefined, fileSize: number) {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return { valid: false as const };
  }

  const [, startValue, endValue] = match;
  let start: number;
  let end: number;

  if (!startValue && !endValue) {
    return { valid: false as const };
  }

  if (!startValue) {
    const suffixLength = parseInt(endValue, 10);
    if (suffixLength <= 0) {
      return { valid: false as const };
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = parseInt(startValue, 10);
    end = endValue ? parseInt(endValue, 10) : fileSize - 1;
  }

  if (start >= fileSize || end >= fileSize || start > end) {
    return { valid: false as const };
  }
  return { valid: true as const, start, end };
}

function getFormDefaults() {
  return {
    jwt: config.testData.jwt || "",
    dataset: "",
    file0: config.testData?.files[0] || "",
  };
}
