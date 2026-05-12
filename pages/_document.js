import { Head, Html, Main, NextScript } from "next/document";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const { organizationJsonLd } = require("../lib/marketing/seo-config");

export default function Document() {
  const orgJson = JSON.stringify(organizationJsonLd());
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/resumora-logo.png" />
        <meta name="theme-color" content="#080f22" />
        <meta name="application-name" content="Resumora" />
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: orgJson }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
