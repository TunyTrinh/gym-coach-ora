const productionMarkers = ["production", "prod", "coachora.com", ".manus.space"];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[load-tests] ${name} is required.`);
  return value;
}

export function assertStagingUrl() {
  const raw = required("COACHORA_STAGING_URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("[load-tests] Staging URL must use HTTPS unless it is local.");
  }
  if (productionMarkers.some((marker) => url.hostname.toLowerCase().includes(marker))) {
    throw new Error("[load-tests] Refusing a URL that appears to be production.");
  }
  if (process.env.PRODUCTION_APP_DOMAIN && url.hostname === process.env.PRODUCTION_APP_DOMAIN) {
    throw new Error("[load-tests] Staging URL must not equal PRODUCTION_APP_DOMAIN.");
  }
  if (process.env.COACHORA_STAGING_CONFIRMATION !== "I_CONFIRM_STAGING_ONLY") {
    throw new Error("[load-tests] Set COACHORA_STAGING_CONFIRMATION=I_CONFIRM_STAGING_ONLY after verifying the target.");
  }
  return url.toString().replace(/\/$/, "");
}

export function assertRunId() {
  const runId = required("COACHORA_LOAD_RUN_ID");
  if (!/^coachora-load-[a-z0-9-]{8,64}$/i.test(runId)) {
    throw new Error("[load-tests] COACHORA_LOAD_RUN_ID must begin with coachora-load- and contain only letters, digits, and hyphens.");
  }
  return runId;
}

export function assertStagingDatabase() {
  const value = required("LOAD_TEST_DATABASE_URL");
  const url = new URL(value);
  const name = url.pathname.replace(/^\//, "").toLowerCase();
  if (!/(stage|staging|test)/.test(url.hostname.toLowerCase()) || !/(stage|staging|test)/.test(name)) {
    throw new Error("[load-tests] LOAD_TEST_DATABASE_URL must identify both a staging/test host and database name.");
  }
  if (process.env.DATABASE_URL && value === process.env.DATABASE_URL) {
    throw new Error("[load-tests] Refusing a database URL equal to DATABASE_URL.");
  }
  if (process.env.PRODUCTION_DATABASE_URL && value === process.env.PRODUCTION_DATABASE_URL) {
    throw new Error("[load-tests] Refusing a database URL equal to PRODUCTION_DATABASE_URL.");
  }
  return value;
}

export function assertLocalSmokeTarget() {
  const appUrl = new URL(required("COACHORA_LOCAL_SMOKE_URL"));
  const localHosts = ["localhost", "127.0.0.1", "::1"];
  if (!localHosts.includes(appUrl.hostname) || appUrl.protocol !== "http:") {
    throw new Error("[load-tests] COACHORA_LOCAL_SMOKE_URL must be an explicit http localhost target.");
  }
  if (process.env.COACHORA_LOCAL_SMOKE_CONFIRMATION !== "I_CONFIRM_LOCAL_ISOLATION") {
    throw new Error("[load-tests] Set COACHORA_LOCAL_SMOKE_CONFIRMATION=I_CONFIRM_LOCAL_ISOLATION after checking the target.");
  }
  const databaseUrl = new URL(required("COACHORA_LOCAL_SMOKE_DATABASE_URL"));
  const databaseName = databaseUrl.pathname.replace(/^\//, "").toLowerCase();
  if (!localHosts.includes(databaseUrl.hostname) || !/(local|test)/.test(databaseName)) {
    throw new Error("[load-tests] COACHORA_LOCAL_SMOKE_DATABASE_URL must use localhost and a database name containing local or test.");
  }
  if ((process.env.DATABASE_URL && databaseUrl.toString() === process.env.DATABASE_URL) || (process.env.PRODUCTION_DATABASE_URL && databaseUrl.toString() === process.env.PRODUCTION_DATABASE_URL)) {
    throw new Error("[load-tests] Refusing a local smoke database URL equal to an application or production database URL.");
  }
  return { appUrl: appUrl.toString().replace(/\/$/, ""), database: databaseUrl.toString() };
}
