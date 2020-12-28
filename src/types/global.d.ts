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
      directory: string;
      currentFileIndex: number;
      files:{fileName: string, size: number, progress: number}[]
      zipSizeOnLastCompletedEntry: number;
      zipFileName: string;
      ready: boolean;
      error: boolean;
    }
    interface JWT {
      groups: string[];
      [key: string]: any; //arbitrary data
    }
    interface AuthRequest {
      jwt: JWT;
      endpoint: string;
      httpMethod: string;
      directory: string;
      fileNames: string[];
    }
    interface AuthResponse {
      hasAccess: boolean;
      statusCode: number;
      error?: string;
      directory: string | undefined;
      fileNames: string[];
    }
  }
}
