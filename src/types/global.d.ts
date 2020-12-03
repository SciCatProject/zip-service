export {};
declare global {
  export namespace Express {
    interface Request {
      access?: Global.Access;
    }
  }
  export namespace Global {
    interface Access {
      username: string;
    }
    interface JWT {
      groups: string[];
      [key: string]: any; //arbitrary data
    }
    interface AuthRequest {
      jwt: JWT,
      endpoint: string;
      httpMethod: string,
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
