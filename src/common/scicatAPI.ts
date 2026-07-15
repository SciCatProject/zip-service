import {
  Configuration,
  DatasetsV4Api,
} from "@scicatproject/scicat-sdk-ts-fetch";
import { config } from "./config";

let datasetsApiInstance: DatasetsV4Api | null = null;

export function scicatDataSetAPI(): DatasetsV4Api {
  const { basePath, accessToken } = config;

  if (!datasetsApiInstance) {
    if (!basePath || !accessToken) {
      throw new Error(
        "SciCat API configuration is missing: Check SCICAT_API_BASE_PATH and SCICAT_API_ACCESS_TOKEN.",
      );
    }

    const apiConfig = new Configuration({
      basePath,
      accessToken,
    });

    datasetsApiInstance = new DatasetsV4Api(apiConfig);
  }

  return datasetsApiInstance;
}
