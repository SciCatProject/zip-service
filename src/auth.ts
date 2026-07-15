import express from "express";
import { config } from "./common/config";
import * as fs from "fs";
import jwtLib from "jsonwebtoken";

import { logger } from "@user-office-software/duo-logger";
import { scicatDataSetAPI } from "./common/scicatAPI";
import { OutputDatasetDto } from "@scicatproject/scicat-sdk-ts-fetch/dist/models";
import path from "path";

export const hasFileAccess = async (
  req: express.Request,
  absoluteFileNames: string[],
  dataset: string | undefined,
): Promise<Global.AuthResponse> => {
  const { jwtSecret } = config;
  const dataSetAPI = scicatDataSetAPI();
  let keywords = {};

  if (!jwtSecret) {
    return {
      hasAccess: false,
      statusCode: 500,
      error: "No JWT secret has been set for zip-service",
      fileNames: [],
    };
  }
  let jwtDecoded: Global.JWT;
  const jwtToken = req.body.jwt || req.cookies.jwt || req.query.jwt;
  try {
    jwtDecoded = jwtLib.verify(jwtToken, jwtSecret) as Global.JWT;
  } catch (e) {
    return {
      hasAccess: false,
      statusCode: 401,
      error: "Invalid or expired JWT",
      fileNames: [],
    };
  }

  logger.logInfo("Request user: ", { user: jwtDecoded.username });

  const authRequest: Global.AuthRequest = {
    jwt: jwtDecoded,
    endpoint: req.originalUrl,
    httpMethod: req.method,
    fileNames: absoluteFileNames,
    dataset,
  };

  if (!authRequest.fileNames || authRequest.fileNames.length === 0) {
    return {
      hasAccess: false,
      statusCode: 400,
      error: "'fileNames' was not specified",
      fileNames: [],
    };
  }
  for (const fileName of absoluteFileNames) {
    const directory = path.dirname(fileName);
    if (!fs.existsSync(directory)) {
      return {
        hasAccess: false,
        statusCode: 404,
        error: `The directory ${directory} does not exist`,
        fileNames: [],
      };
    }
  }

  const groups = jwtDecoded.groups;
  if (!groups) {
    return {
      hasAccess: false,
      statusCode: 400,
      error: "The jwt does not contain field 'groups'",
      fileNames: [],
    };
  }
  logger.logInfo("User Groups: ", { groups });

  if (!dataset) {
    const isAdmin = authRequest.jwt.groups.includes("admin");
    if (isAdmin) {
      return {
        hasAccess: true,
        statusCode: 200,
        error: "",
        fileNames: authRequest.fileNames,
        keywords: keywords,
      };
    }
  }

  const valid = await dataSetAPI
    .datasetsV4ControllerFindById({ pid: authRequest.dataset })
    .then((value: OutputDatasetDto) => {
      const isPublic = value.isPublished;
      const isAdmin = authRequest.jwt.groups?.includes("admin");
      const hasAccessGroup = value.accessGroups?.some((item) =>
        new Set(authRequest.jwt.groups).has(item),
      );
      const hasOwnerGroup = authRequest.jwt.groups?.includes(value.ownerGroup);
      keywords = getDatasetKeywords(value);
      if (isPublic || isAdmin || hasAccessGroup || hasOwnerGroup) {
        return true;
      }
      return false;
    })
    .catch((err) => {
      logger.logError("Error caught at access validation", { err });
      return false;
    });

  return {
    hasAccess: valid,
    statusCode: valid ? 200 : 403,
    error: valid ? "" : "You do not have access to this resource",
    fileNames: valid ? authRequest.fileNames : [],
    keywords: valid ? keywords : {},
  };
};

function getDatasetKeywords(dataset: OutputDatasetDto) {
  const requiredKeywords: string[] = Array.isArray(config.requiredKeywords)
    ? config.requiredKeywords
    : [];
  const keywords: Record<string, unknown> = {};
  const datasetValues = dataset as unknown as Record<string, unknown>;
  for (const keyword of requiredKeywords) {
    const match = keyword.match(/^([^[\]]+)\[(\d+)\]$/);

    if (match) {
      const [, property, index] = match;
      const value = datasetValues[property];

      keywords[keyword] = Array.isArray(value)
        ? value[Number(index)]
        : undefined;
    } else {
      keywords[keyword] = datasetValues[keyword];
    }
  }

  return keywords;
}
