# Google Identity and Coach Authorization

Coachora accepts Google identities for Client and Coach access only after the Google OpenID Connect userinfo response includes `email_verified: true`. Google emails are trimmed and lowercased using the `en-US` locale before authorization lookup and storage. Administrator password access is separately restricted to a local account whose persisted role is `admin`.

Coach access is granted, disabled, revoked, and re-authorized only through backend Admin procedures. Each change is written to `auditLogs`; existing Coach rows and booking history are retained when access is removed.

Source: [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).
