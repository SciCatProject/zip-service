import express from "express";
import { config } from "./common/config";
import * as fs from "fs";
import jwtLib from "jsonwebtoken";

import { logger } from "@user-office-software/duo-logger";
import { scicatDataSetAPI } from "./common/scicatAPI"
import { OutputDatasetObsoleteDto } from "@scicatproject/scicat-sdk-ts-fetch/dist/models";

export const hasFileAccess = async (
  req: express.Request,
  directory: string,
  fileNames: string[],
  dataset: string
): Promise<Global.AuthResponse> => {

  const { jwtSecret } = config;
  const dataSetAPI = scicatDataSetAPI();

  if (!jwtSecret) {
    return {
      hasAccess: false,
      statusCode: 500,
      error: "No JWT secret has been set for zip-service",
      directory: undefined,
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
      directory: undefined,
      fileNames: [],
    };
  }

  logger.logInfo("Request user: ", { user: jwtDecoded.username });

  const authRequest: Global.AuthRequest = {
    jwt: jwtDecoded,
    endpoint: req.originalUrl,
    httpMethod: req.method,
    directory,
    fileNames,
    dataset
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

  const valid = await dataSetAPI.datasetsControllerFindById({pid: authRequest.dataset}).then(
    (value: OutputDatasetObsoleteDto) => 
      {
        const isPublic = value.isPublished; 
        const hasAccessGroup = value.accessGroups.some(item => new Set(authRequest.jwt.groups).has(item)); 
        const hasOwnerGroup = authRequest.jwt.groups.includes(value.ownerGroup);  
        if (isPublic || hasAccessGroup || hasOwnerGroup) {
          return true;
        }
        return false;
      }
    ).catch((e) => {
       
      return false;
    });
  
    return {
      hasAccess: valid,
      statusCode: valid ? 200 : 403,
      error: valid ? "" : "You do not have access to this resource",
      directory: valid ? authRequest.directory : undefined,
      fileNames: valid ? authRequest.fileNames : [],
    };
}
