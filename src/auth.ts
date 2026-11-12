import express from "express";
import { config } from "./common/config";
import { validateFilenames } from "./common/file_utils";
import jwtLib from "jsonwebtoken";

import { logger } from "@user-office-software/duo-logger";
import { scicatDataSetAPI } from "./common/scicatAPI";
import { OutputDatasetDto } from "@scicatproject/scicat-sdk-ts-fetch/dist/models";

export const hasFileAccess = async (
  req: express.Request,
  fileNames: string[],
  dataset: string | undefined,
): Promise<Global.AuthResponse> => {
  const { jwtSecret } = config;
  const dataSetAPI = scicatDataSetAPI();
  let variables = {};

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
    fileNames: fileNames,
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
  if (!validateFilenames(fileNames)) {
    return {
      hasAccess: false,
      statusCode: 404,
      error: "The specified filenames are invalid",
      fileNames: [],
    };
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
        variables: variables,
      };
    }
  }

  const valid = await dataSetAPI
    .datasetsV4ControllerFindByIdV4({ pid: authRequest.dataset })
    .then((value: OutputDatasetDto) => {
      const isPublic = value.isPublished;
      const hasAccessGroup = value.accessGroups?.some((item) =>
        new Set(authRequest.jwt.groups).has(item),
      );
      const hasOwnerGroup = authRequest.jwt.groups?.includes(value.ownerGroup);
      variables = getDatasetVariables(value);
      if (isPublic || hasAccessGroup || hasOwnerGroup) return true;

      return false;
    })
    .catch((err) => {
      logger.logError("Error caught at access validation", { err });
      return false;
    });

  // Validate collected variables
  // avoid ".." in values
  for (const [key, value] of Object.entries(variables)) {
    const values = Array.isArray(value) ? value : [value];
    if (values.some((v) => typeof v == "string" && v.includes(".."))) {
      return {
        hasAccess: false,
        statusCode: 400,
        error: `value of ${key} is ambigious: contains '..' !`,
        fileNames: [],
        variables: valid ? variables : {},
      };
    }
  }

  return {
    hasAccess: valid,
    statusCode: valid ? 200 : 403,
    error: valid ? "" : "You do not have access to this resource",
    fileNames: valid ? authRequest.fileNames : [],
    variables: valid ? variables : {},
  };
};

function getDatasetVariables(dataset: OutputDatasetDto) {
  const requiredVariables: string[] = Array.isArray(
    config.requiredDatasetVariables,
  )
    ? config.requiredDatasetVariables
    : [];
  const variables: Record<string, unknown> = {};
  const datasetValues = dataset as unknown as Record<string, unknown>;
  for (const variable of requiredVariables) {
    const match = variable.match(/^([^[\]]+)\[(\d+)\]$/);

    if (match) {
      const [, property, index] = match;
      const value = datasetValues[property];

      variables[variable] = Array.isArray(value)
        ? value[Number(index)]
        : undefined;
    } else {
      variables[variable] = datasetValues[variable];
    }
  }

  return variables;
}
