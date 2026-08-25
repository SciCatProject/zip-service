import * as fs from "fs";
import { config } from "../common/config";
import { logger } from "@user-office-software/duo-logger";
import path from "path";

export interface FileLink {
  filename: string;
  filepath: string;
  token: string;
  expiresAt: number;
  datasetId?: string;
  directory?: string;
}
export interface FileResolution {
  statusCode: number;
  filename?: string;
  error?: string;
  folders?: string[];
}

export function validateFilenames(filenames: string[]): boolean {
  for (const filename of filenames) {
    if (filename.includes("..")) {
      return false;
    }
  }
  return true;
}

export function resolvePattern(
  pattern: string,
  keywords: Record<string, string>,
): string {
  const resolved = pattern.replace(/\{([^}]+)\}/g, (_, key) => {
    try {
      const value = keywords[key];
      if (value === undefined) {
        throw new Error(`Missing keyword '${key}'`);
      }
      if (config.facility === "ILL") {
        if (key.startsWith("proposalId")) {
          return value.startsWith("internalUse") ? value : "exp_" + value;
        } else if (key == "type") {
          return value.startsWith("raw") ? "rawdata" : value;
        } else if (key.startsWith("instrumentId")) {
          return value.toLowerCase();
        }
      }
      return value;
    } catch {
      return undefined;
    }
  });
  if (!resolved || !validateResolvedPattern(resolved))
    throw new Error("The resolved path is not valid or unaccessable !");
  return resolved;
}

export function validateResolvedPattern(pattern: string): boolean {
  const allowed = path.resolve(config.allowedDataDirectory);
  const patternDir = path.resolve(pattern);

  const relative = path.relative(allowed, patternDir);

  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

export function findFile(dirPattern: string, filename: string): string[] {
  const stars = (dirPattern.match(/\*/g) ?? []).length;
  if (stars > 1) {
    throw new Error("Only a single '*' is supported.");
  }
  try {
    if (stars === 0) {
      const filePath = path.join(dirPattern, filename);
      return fs.existsSync(filePath) ? [path.dirname(filePath)] : [];
    }

    const [prefix, suffix] = dirPattern.split("*");
    const parentDir = path.resolve(prefix);
    const normalizedSuffix = suffix.replace(/^[/\\]/, "");
    const matchedFolders: string[] = [];

    fs.readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => {
        const pathFromPattern = path.join(
          parentDir,
          entry.name,
          normalizedSuffix,
        );

        const filePath = path.join(pathFromPattern, filename);
        if (fs.existsSync(filePath)) {
          matchedFolders.push(path.dirname(filePath));
        }
      });
    return matchedFolders;
  } catch (err) {
    logger.logError("Error searching file directories", { err });
    return [];
  }
}

export function resolveFilePath(
  filename: string,
  keywords: Record<string, string> = {},
): FileResolution {
  // filename is an Absolute Path case
  if (path.isAbsolute(filename)) {
    return {
      statusCode: 400,
      error: "Absolute filenames are not supported",
    };
  }
  const dataRoot = config.allowedDataDirectory;
  const dirPattern = config.directoryPathPattern;
  if (!dataRoot) {
    return {
      statusCode: 500,
      error: "Data root directory is not configured",
    };
  }
  // directoryPattern must be configurad
  if (!dirPattern) {
    return {
      statusCode: 400,
      error: "directoryPathPattern must be specified",
    };
  }

  let resolvedPattern: string;
  try {
    resolvedPattern = resolvePattern(dirPattern, keywords);
  } catch (err) {
    logger.logError("Error resolving file path pattern", { err });
    return {
      statusCode: 400,
      error:
        err instanceof Error ? err.message : "File path pattern is invalid",
    };
  }
  const matchedFolders = findFile(resolvedPattern, filename);
  if (matchedFolders.length === 0) {
    return {
      statusCode: 404,
      error: "File not found",
    };
  } else if (matchedFolders.length > 1) {
    return {
      statusCode: 409,
      error: "File exists in multiple directories",
      folders: matchedFolders,
    };
  }
  return {
    statusCode: 200,
    filename,
    folders: matchedFolders,
  };
}
