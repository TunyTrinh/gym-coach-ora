export const ENV = {
  appId: process.env.APP_ID ?? process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  selfHosted: process.env.SELF_HOSTED === "true",
};

const COMMON_SECRET_VALUES = new Set([
  "changeme",
  "change-me",
  "replace-me",
  "replace-with-a-strong-random-secret",
  "secret",
]);

const MIN_SIGNING_SECRET_LENGTH = 32;
const MIN_SIGNING_SECRET_DISTINCT_CHARACTERS = 16;

export function authEnvironmentErrors(config: Pick<typeof ENV, "appId" | "cookieSecret">) {
  const errors: string[] = [];
  const secret = config.cookieSecret.trim();

  if (!config.appId.trim()) errors.push("APP_ID (or VITE_APP_ID) is required");
  if (!secret) {
    errors.push("JWT_SECRET is required");
  } else if (
    secret.length < MIN_SIGNING_SECRET_LENGTH ||
    COMMON_SECRET_VALUES.has(secret.toLowerCase()) ||
    new Set(secret).size < MIN_SIGNING_SECRET_DISTINCT_CHARACTERS
  ) {
    errors.push("JWT_SECRET must be at least 32 characters and contain sufficient randomness");
  }

  return errors;
}

export function assertAuthEnvironment(config: Pick<typeof ENV, "appId" | "cookieSecret"> = ENV) {
  const errors = authEnvironmentErrors(config);
  if (errors.length > 0) {
    throw new Error(`Invalid authentication configuration: ${errors.join("; ")}`);
  }
}
