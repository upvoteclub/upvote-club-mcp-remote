export interface RemoteOAuthConfig {
  authServerUrl: string;
  resourceUrl: string;
  resourceMetadataUrl: string;
  internalSecret: string;
}

export declare function getRemoteOAuthConfig(): RemoteOAuthConfig;

export declare function createUpvoteClubMcpHandler(options?: {
  config?: RemoteOAuthConfig;
  logPrefix?: string;
}): (request: Request) => Promise<Response>;
