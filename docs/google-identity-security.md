# Google Identity and Coach Authorization

Coachora accepts Google identities for Client and Coach access only after the Google OpenID Connect userinfo response includes `email_verified: true`. Google emails are trimmed and lowercased using the `en-US` locale before authorization lookup and storage. Administrator password access is separately restricted to a local account whose persisted role is `admin`.

Coach access is granted, disabled, revoked, and re-authorized only through backend Admin procedures. Each change is written to `auditLogs`; existing Coach rows and booking history are retained when access is removed.

## Session requirements

`APP_ID` and a strong `JWT_SECRET` are mandatory. The API fails before bootstrap or database work when either value is invalid. Session JWT verification pins HS256, expiration, issuer `coachora:<APP_ID>`, audience `<APP_ID>`, and the private `appId` claim. A Client or Coach session is accepted only when the current persisted account still uses verified Google login; Admin uses the separate local Admin login.

## Web/PWA and native callback flows

Coachora includes both Expo native builds and a web/PWA build.

- Web/PWA starts at `/api/auth/google`. Google returns to the registered HTTPS `/api/auth/google/callback`; the server sets an HTTP-only session cookie and redirects to `APP_BASE_URL`.
- Native opens that same server endpoint with its compiled callback URI. The server accepts only the exact `manusgymcoachbookingpwa` callback scheme and `/oauth/callback` route. After verified Google identity sync, it redirects with an opaque, two-minute exchange code. The app sends the code once to `POST /api/auth/native/exchange`, receives the session over HTTPS, and stores it in SecureStore.
- Session JWTs and private user claims are never placed in callback URLs. OAuth state and exchange codes are single-use and expire server-side.

The native exchange registry is currently process-local. Do not deploy more than one application instance until it is moved to a shared short-lived store and the flow is exercised in staging.

Source: [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).
