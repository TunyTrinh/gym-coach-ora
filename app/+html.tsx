import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Document({ children }: PropsWithChildren) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
      <meta name="theme-color" content="#0d0d0f" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="GymFlow" />
      <link rel="manifest" href="/manifest.json" />
      <ScrollViewStyleReset />
    </head>
    <body>
      {children}
      <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { var refreshing = false; navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function (registration) { registration.update(); navigator.serviceWorker.addEventListener('controllerchange', function () { if (!refreshing) { refreshing = true; window.location.reload(); } }); }).catch(function () {}); }); }` }} />
    </body>
  </html>;
}
