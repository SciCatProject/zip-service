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

export type KeywordValue = string | string[];

// May return multiple values, each one becoming a candidate directory.
function normalizeKeywordValue(key: string, value: string): KeywordValue {
  if (config.facility === "ILL") {
    if (key.startsWith("proposalId")) {
      return value.startsWith("internalUse") ? value : "exp_" + value;
    } else if (key == "type") {
      if (value == "raw") return "rawdata";
      else if (value == "derived") return ["derived", "processed"];
      else return value;
    } else if (key.startsWith("instrumentId")) {
      return value.toLowerCase();
    }
  }
  return value;
}

// Resolves the pattern placeholders, a list keyword value expands
// the pattern into one candidate directory per value.
export function resolvePattern(
  pattern: string,
  keywords: Record<string, KeywordValue>,
): string[] {
  const keys = new Set(
    (pattern.match(/\{[^}]+\}/g) ?? []).map((match) => match.slice(1, -1)),
  );
  let resolved = [pattern];
  for (const key of keys) {
    const value = keywords[key];
    const values = (Array.isArray(value) ? value : [value])
      .filter((v) => v !== undefined && v !== null)
      .flatMap((v) => normalizeKeywordValue(key, String(v)));
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) {
      throw new Error(`Missing keyword '${key}'`);
    }
    resolved = resolved.flatMap((p) =>
      uniqueValues.map((v) => p.split(`{${key}}`).join(v)),
    );
  }
  if (!resolved.every(validateResolvedPattern))
    throw new Error("The resolved path is not valid or unaccessable !");
  return [...new Set(resolved)];
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
      return fs.existsSync(filePath) ? [path.resolve(dirPattern)] : [];
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
          matchedFolders.push(pathFromPattern);
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
  keywords: Record<string, KeywordValue> = {},
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

  let resolvedPatterns: string[];
  try {
    resolvedPatterns = resolvePattern(dirPattern, keywords);
  } catch (err) {
    logger.logError("Error resolving file path pattern", { err });
    return {
      statusCode: 400,
      error:
        err instanceof Error ? err.message : "File path pattern is invalid",
    };
  }
  const matchedFolders = [
    ...new Set(resolvedPatterns.flatMap((p) => findFile(p, filename))),
  ];
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
