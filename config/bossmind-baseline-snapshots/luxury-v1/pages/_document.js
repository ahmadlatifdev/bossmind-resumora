import { Head, Html, Main, NextScript } from "next/document";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_RAW = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || "";
const CLARITY_ID = /^[a-z0-9]{3,32}$/i.test(CLARITY_RAW) ? CLARITY_RAW : "";
const BING_VERIFY_RAW = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "";
const BING_VERIFY = /^[A-Za-z0-9_-]{6,128}$/.test(BING_VERIFY_RAW) ? BING_VERIFY_RAW : "";
const { organizationJsonLd } = require("../lib/marketing/seo-config");
const { withBrandingQuery } = require("../lib/marketing/branding-assets");
const { version: deployUiVersion } = require("../config/branding-asset-version.json");

export default function Document() {
  const orgJson = JSON.stringify(organizationJsonLd());
  const q = withBrandingQuery;
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href={q("/manifest.webmanifest")} />
        <link rel="icon" href={q("/favicon.svg")} type="image/svg+xml" />
        <link rel="icon" href={q("/icon.svg")} type="image/svg+xml" />
        <link rel="icon" href={q("/favicon.ico")} sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href={q("/favicon-32x32.png")} />
        <link rel="icon" type="image/png" sizes="16x16" href={q("/favicon-16x16.png")} />
        <link rel="apple-touch-icon" href={q("/apple-touch-icon.png")} sizes="180x180" />
        <link rel="icon" type="image/png" sizes="192x192" href={q("/android-chrome-192x192.png")} />
        <link rel="icon" type="image/png" sizes="512x512" href={q("/android-chrome-512x512.png")} />
        <meta name="msapplication-TileImage" content={q("/icon-192.png")} />
        <meta name="theme-color" content="#080f22" />
        <meta name="application-name" content="Resumora" />
        <meta name="resumora-deploy-ui" content={deployUiVersion} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {GA_ID ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
              }}
            />
          </>
        ) : null}
        {process.env.NEXT_PUBLIC_GSC_VERIFICATION ? (
          <meta name="google-site-verification" content={process.env.NEXT_PUBLIC_GSC_VERIFICATION} />
        ) : null}
        {BING_VERIFY ? <meta name="msvalidate.01" content={BING_VERIFY} /> : null}
        {CLARITY_ID ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(
                CLARITY_ID
              )});`,
            }}
          />
        ) : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: orgJson }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
