export default function Head() {
  const adClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();

  if (!adClient) {
    return null;
  }

  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`}
      crossOrigin="anonymous"
    />
  );
}
