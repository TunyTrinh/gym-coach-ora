export type GoogleIdentity = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function normalizeGoogleEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function isValidGoogleEmail(value: string) {
  const normalized = normalizeGoogleEmail(value);
  return normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function hasVerifiedGoogleIdentity(profile: GoogleIdentity): profile is Required<Pick<GoogleIdentity, "sub" | "email">> & GoogleIdentity {
  return Boolean(profile.sub && profile.email && profile.email_verified === true && isValidGoogleEmail(profile.email));
}

export function isAdminLocalAccount(user: { loginMethod: string | null; role: string }) {
  return user.loginMethod === "local" && user.role === "admin";
}
