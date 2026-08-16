import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Document({ children }: PropsWithChildren) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
      <meta name="theme-color" content="#0d0d0f" />
      <meta name="application-name" content="Coachora" />
      <meta name="description" content="Book gym sessions and personal coaching with Coachora." />
      <meta name="format-detection" content="telephone=no" />
      <meta name="color-scheme" content="dark light" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Coachora" />
      <link rel="manifest" href="/manifest.json" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
      <ScrollViewStyleReset />
    </head>
    <body>
      {children}
      <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { var refreshing = false; navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function (registration) { registration.update(); navigator.serviceWorker.addEventListener('controllerchange', function () { if (!refreshing) { refreshing = true; window.location.reload(); } }); }).catch(function () {}); }); }` }} />
    </body>
  </html>;
}
