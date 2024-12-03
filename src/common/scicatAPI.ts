import { Configuration, DatasetsApi } from "@scicatproject/scicat-ts-fetch-test";
import { config } from "./config";

let datasetsApiInstance: DatasetsApi | null = null;

export function scicatDataSetAPI(): DatasetsApi {
   const { basePath, accessToken } = config;

  if (!datasetsApiInstance) {

    if (!basePath || !accessToken) {
      throw new Error("SciCat API configuration is missing: Check SCICAT_API_BASE_PATH and SCICAT_API_ACCESS_TOKEN.");
    }

    const apiConfig = new Configuration({
      basePath  ,
      accessToken,
    });

    datasetsApiInstance = new DatasetsApi(apiConfig);
  }

  return datasetsApiInstance;
}
