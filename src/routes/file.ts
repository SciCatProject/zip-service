import express from "express";
import * as fs from "fs";
import { config } from "../common/config";
import {
  FileLink,
  FileResolution,
  resolveFilePath,
} from "../common/file_utils";
import { hasFileAccess } from "../auth";
import { logger } from "@user-office-software/duo-logger";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

const fileLinks = new Map<string, FileLink>();
const fileLinkRetentionMillis =
  config.fileLinkRetentionMillis || 60 * 60 * 1000;

router.get("/", (req, res) => {
  res.render("file_form", getFormDefaults());
});

router.post("/", async (req, res) => {
  cleanupExpiredFileLinks();

  const bodyDirectory = req.body.directory;
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

  if (
    !path.isAbsolute(bodyFileName) &&
    typeof bodyDirectory !== "string" &&
    !config.directoryPathPattern
  ) {
    return res.status(400).send({
      error: "Directory or directoryPathPattern must be specified",
    });
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

  const streamUrl = createFileAccessUrl(req, "stream", fileData.token, true);

  const hdfUrl = createHdfViewUrl(streamUrl, fileData.filename);
  if (!hdfUrl) {
    return res.status(500).send("HDF View service URL is not configured");
  }

  return res.redirect(303, hdfUrl);
}

async function createFileLink(req: express.Request, res: express.Response) {
  const datasetId = req.body.dataset || req.body.datasetId;
  const directory =
    typeof req.body.directory === "string" ? req.body.directory : undefined;
  const filename = getBodyFileNames(req.body)[0] as string;
  const fileAction =
    typeof req.body.fileAction === "string" ? req.body.fileAction : "";

  if (shouldResolveFromDataset(filename, directory)) {
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
      directory,
      filename,
      authResponse.keywords ?? {},
      undefined,
      fileAction,
    );
  }

  const resolution = resolveFilePath(filename, directory);
  if (resolution.error) {
    return res.status(resolution.statusCode).send({
      error: resolution.error,
      folders: resolution.folders,
    });
  }
  const filepath = path.join(resolution.folders?.[0], filename);
  if (!filepath) {
    return res.status(500).send({
      error: "File path could not be resolved",
    });
  }
  const { hasAccess, statusCode, error } = await hasFileAccess(
    req,
    [filepath],
    datasetId,
  );
  if (!hasAccess) {
    logger.logError("Error accessing file", { statusCode, error });
    return res.status(statusCode).send({ error });
  }

  return createResolvedFileLink(
    req,
    res,
    datasetId,
    directory,
    filename,
    undefined,
    filepath,
    fileAction,
  );
}

function createResolvedFileLink(
  req: express.Request,
  res: express.Response,
  datasetId: string,
  directory: string | undefined,
  filename: string,
  keywords?: Record<string, string>,
  resolvedFilepath?: string,
  fileAction = "",
) {
  const resolution: FileResolution = resolvedFilepath
    ? {
        statusCode: 200,
        filename,
        folders: [path.dirname(resolvedFilepath)],
      }
    : resolveFilePath(filename, directory, keywords);

  if (resolution.error) {
    return res.status(resolution.statusCode).send({
      error: resolution.error,
      folders: resolution.folders,
    });
  }

  const filepath = path.join(resolution.folders?.[0], filename);

  if (!filepath) {
    return res.status(500).send({
      error: "File path could not be resolved",
    });
  }
  const fileStat = getFileStat(filepath);

  if (!fileStat || fileStat.isDirectory()) {
    return res.status(404).send({
      error: "File not found",
    });
  }

  const token = uuidv4();

  fileLinks.set(token, {
    filename,
    filepath,
    datasetId,
    directory,
    token,
    expiresAt: Date.now() + fileLinkRetentionMillis,
  });

  const downloadUrl = createFileAccessUrl(req, "download", token);
  const streamUrl = createFileAccessUrl(req, "stream", token);
  const openUrl = createFileAccessUrl(req, "open", token);

  if (fileAction === "Download") {
    return res.redirect(303, downloadUrl);
  }

  if (fileAction === "Open") {
    return res.redirect(303, openUrl);
  }

  return res.status(201).send({
    fileName: filename,
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
  req: express.Request,
  action: "download" | "stream" | "open",
  token: string,
  absolute = false,
) {
  const pathname = `/file/${action}?token=${token}`;
  const prefixedPath = withForwardedPrefix(req, pathname);

  if (!absolute) {
    return prefixedPath;
  }

  return withRequestOrigin(req, prefixedPath);
}

function createHdfViewUrl(fileUrl: string, filename?: string) {
  const url = new URL(config.hdfViewServiceUrl);
  if (!url) {
    return null;
  }
  url.searchParams.set("url", encodeURIComponent(fileUrl));
  url.searchParams.set("filesSidebar", "hidden");
  if (filename) {
    url.searchParams.set("label", filename);
  }
  return url.toString();
}

function withForwardedPrefix(req: express.Request, pathname: string) {
  const forwardedPrefix = req.headers["x-forwarded-prefix"];
  const prefix = Array.isArray(forwardedPrefix)
    ? forwardedPrefix[0]
    : forwardedPrefix || "";
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${normalizedPrefix}${pathname}`;
}

function withRequestOrigin(req: express.Request, pathname: string) {
  const protocol =
    getFirstHeader(req, "x-forwarded-proto") || req.protocol || "http";
  const host = getFirstHeader(req, "x-forwarded-host") || req.get("host");
  if (!host) {
    return pathname;
  }
  return `${protocol}://${host}${pathname}`;
}

function getFirstHeader(req: express.Request, headerName: string) {
  const value = req.headers[headerName];
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === "string") {
    return value.split(",")[0].trim();
  }
  return "";
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

function shouldResolveFromDataset(filename: string, directory: unknown) {
  return (
    !path.isAbsolute(filename) &&
    typeof directory !== "string" &&
    Boolean(config.directoryPathPattern)
  );
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
    return fs.statSync(fileName);
  } catch (err) {
    logger.logError("Error getting file stat", { err });

    return null;
  }
}

function getContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (
    extension === ".h5" ||
    extension === ".hdf5" ||
    extension === ".hdf" ||
    extension === ".nxs"
  ) {
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
  const readStream = fs.createReadStream(fileName, options);
  readStream.on("error", (err) => {
    logger.logError("Error reading file stream", { err });
    if (!res.headersSent) {
      return res.status(500).send("Unable to read file");
    }
    return res.end();
  });
  return readStream.pipe(res);
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
    directory: config.testData.directory || "",
    dataset: "",
    file0: config.testData?.files[0] || "",
  };
}
