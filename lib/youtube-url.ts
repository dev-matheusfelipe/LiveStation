export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, "");

  if (hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && id.length === 11 ? id : null;
  }

  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
    return null;
  }

  const vParam = url.searchParams.get("v");
  if (vParam && vParam.length === 11) {
    return vParam;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
  if (embedIndex !== -1 && parts[embedIndex + 1]?.length === 11) {
    return parts[embedIndex + 1];
  }

  return null;
}
