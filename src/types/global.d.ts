export {};
declare module "express-session" {
  interface SessionData {
    zipData: Global.ZipData;
  }
}
declare global {
  export namespace Global {
    interface Access {
      username: string;
    }
    interface ZipData {
      currentFileIndex: number;
      files: { fileName: string; size: number; progress: number }[];
      zipSizeOnLastCompletedEntry: number;
      zipFileName: string;
      ready: boolean;
      datasetId: string;
    }
    interface JWT {
      groups: string[];
      [key: string]: unknown; //arbitrary data
    }
    interface AuthRequest {
      jwt: JWT;
      endpoint: string;
      httpMethod: string;
      fileNames: string[];
      dataset: string;
    }
    interface AuthResponse {
      hasAccess: boolean;
      statusCode: number;
      error?: string;
      fileNames: string[];
      keywords?: Record<string, string>;
    }
  }
}
