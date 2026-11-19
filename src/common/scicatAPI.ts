import {
  Configuration,
  DatasetsV4Api,
} from "@scicatproject/scicat-sdk-ts-fetch";
import { config } from "./config";

let datasetsApiInstance: DatasetsV4Api | null = null;

export function scicatDataSetAPI(): DatasetsV4Api {
  const { scicatApiBasePath, scicatApiAccessToken } = config;

  if (!datasetsApiInstance) {
    if (!scicatApiBasePath || !scicatApiAccessToken) {
      throw new Error(
        "SciCat API configuration is missing: Check SCICAT_API_BASE_PATH and SCICAT_API_ACCESS_TOKEN.",
      );
    }

    const apiConfig = new Configuration({
      basePath: scicatApiBasePath,
      accessToken: scicatApiAccessToken,
    });

    datasetsApiInstance = new DatasetsV4Api(apiConfig);
  }

  return datasetsApiInstance;
}
