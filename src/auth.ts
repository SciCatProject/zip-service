import express from "express";
import config from "./local.config.json";
import jwtLib from "jsonwebtoken";
import * as fs from "fs";

export const hasFileAccess = (
  req: express.Request,
  directory: string,
  fileNames: string[]
): Global.AuthResponse => {
  const { jwtSecret, facility } = config;
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
  try {
    jwtDecoded = jwtLib.verify(
      req.body.jwt || req.cookies.jwt || req.query.jwt,
      jwtSecret
    ) as Global.JWT;
  } catch (e) {
    return {
      hasAccess: false,
      statusCode: 401,
      error: "Invalid or expired JWT",
      directory: undefined,
      fileNames: [],
    };
  }
  const authRequest: Global.AuthRequest = {
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
  const splitDirectory = directory.split("/");
  const splitDirectorsQuoted = splitDirectory.map((dir) => {
    if (dir.indexOf(" ") !== -1) {
      return "\"" + dir + "\"";
    } else {
      return dir;
    }
  });
  authRequest.directory = splitDirectorsQuoted.join("/");
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

const authMAXIV = (authRequest: Global.AuthRequest): Global.AuthResponse => {
  const valid =
    authRequest.jwt.groups.filter(
      (group) => group.trim() && authRequest.directory.indexOf(group) > -1
    ).length > 0;

  return {
    hasAccess: valid,
    statusCode: valid ? 200 : 403,
    error: valid ? "" : "You do not have access to this resource",
    directory: valid ? authRequest.directory : undefined,
    fileNames: valid ? authRequest.fileNames : [],
  };
};
