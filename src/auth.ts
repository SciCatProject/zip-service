import express from "express";
import { config } from "./common/config";
import * as fs from "fs";
import jwtLib from "jsonwebtoken";

import { logger } from "@user-office-software/duo-logger";
import { scicatDataSetAPI } from "./common/scicatAPI";
import { OutputDatasetObsoleteDto } from "@scicatproject/scicat-sdk-ts-fetch/dist/models";
import path from "path";

export const hasFileAccess = async (
  req: express.Request,
  absoluteFileNames: string[],
  dataset: string
): Promise<Global.AuthResponse> => {
  const { jwtSecret } = config;
  const dataSetAPI = scicatDataSetAPI();

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

  const valid = await dataSetAPI
    .datasetsControllerFindById({ pid: authRequest.dataset })
    .then((value: OutputDatasetObsoleteDto) => {
      const isPublic = value.isPublished;
      const hasAccessGroup = value.accessGroups.some((item) =>
        new Set(authRequest.jwt.groups).has(item)
      );

      const hasOwnerGroup = authRequest.jwt.groups.includes(value.ownerGroup);
      if (isPublic || hasAccessGroup || hasOwnerGroup) {
        return true;
      }
      return false;
    })
    .catch(() => {
      return false;
    });

  return {
    hasAccess: valid,
    statusCode: valid ? 200 : 403,
    error: valid ? "" : "You do not have access to this resource",
    fileNames: valid ? authRequest.fileNames : [],
  };
};
