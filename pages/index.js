import WeeklyHomePage from "@/components/marketing/WeeklyHomePage";

export async function getStaticProps() {
  return {
    props: {
      weekAnchor: new Date().toISOString(),
    },
    revalidate: 3600,
  };
}

export default function Home(pageProps) {
  return <WeeklyHomePage {...pageProps} />;
}
