import { NextResponse } from "next/server";

type SearchVideo = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
};

type SearchChannel = {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
};

const MOCK_VIDEOS: SearchVideo[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channelTitle: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg"
  },
  {
    id: "4xDzrJKXOOY",
    title: "Transamazonica ao vivo",
    channelTitle: "Rizzer",
    thumbnail: "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg"
  },
  {
    id: "5qap5aO4i9A",
    title: "lofi hip hop radio - beats to sleep/chill to",
    channelTitle: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg"
  },
  {
    id: "z6H4M0F9Dls",
    title: "Live coding session",
    channelTitle: "freeCodeCamp.org",
    thumbnail: "https://i.ytimg.com/vi/z6H4M0F9Dls/hqdefault.jpg"
  }
];

const MOCK_CHANNELS: SearchChannel[] = [
  {
    id: "UCSJ4gkVC6NrvII8umztf0Ow",
    title: "Lofi Girl",
    description: "24/7 lofi hip hop radio e lives de estudo com visual icônico.",
    thumbnail: "https://yt3.googleusercontent.com/ytc/AIdro_kmglf0pK7IUDsQ0N-Y7CBxBX9LMF5gKxvl_7mU=s176-c-k-c0x00ffffff-no-rj"
  },
  {
    id: "UC8butISFwT-Wl7EV0hUK0BQ",
    title: "freeCodeCamp.org",
    description: "Cursos completos e lives sobre programação e tecnologia.",
    thumbnail: "https://yt3.googleusercontent.com/ytc/AIdro_nXvT2q7sA8m70o7AkYZnkln-7nn8TfM4f4g8aH=s176-c-k-c0x00ffffff-no-rj"
  },
  {
    id: "UCvgSmIdI92W4KnP15fJwfwA",
    title: "Rizzer",
    description: "Canal com transmissões, bastidores e conteúdos ao vivo da comunidade.",
    thumbnail: null
  }
];

function filterMock(query: string) {
  const normalized = query.trim().toLowerCase();
  const contains = (value: string) => value.toLowerCase().includes(normalized);
  return {
    videos: MOCK_VIDEOS.filter((video) => contains(video.title) || contains(video.channelTitle) || contains("rizzer")),
    channels: MOCK_CHANNELS.filter((channel) => contains(channel.title) || contains("rizzer"))
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "Parametro query obrigatorio." }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    const mock = filterMock(query);
    return NextResponse.json({ source: "mock", videos: mock.videos, channels: mock.channels });
  }

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("maxResults", "20");
  endpoint.searchParams.set("type", "video,channel");
  endpoint.searchParams.set("safeSearch", "moderate");
  endpoint.searchParams.set("regionCode", "BR");
  endpoint.searchParams.set("relevanceLanguage", "pt");
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      const mock = filterMock(query);
      return NextResponse.json({
        source: "mock",
        videos: mock.videos,
        channels: mock.channels
      });
    }

    const data = (await response.json()) as {
      items?: Array<{
        id?: { kind?: string; videoId?: string; channelId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          description?: string;
          thumbnails?: {
            medium?: { url?: string };
            high?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };

    const videos: SearchVideo[] = [];
    const channels: SearchChannel[] = [];
    for (const item of data.items ?? []) {
      const kind = item.id?.kind ?? "";
      if (kind.includes("video") && item.id?.videoId) {
        videos.push({
          id: item.id.videoId,
          title: item.snippet?.title ?? "Video sem titulo",
          channelTitle: item.snippet?.channelTitle ?? "Canal desconhecido",
          thumbnail:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            null
        });
      }
      if (kind.includes("channel") && item.id?.channelId) {
        channels.push({
          id: item.id.channelId,
          title: item.snippet?.title ?? "Canal sem titulo",
          description: item.snippet?.description ?? "",
          thumbnail:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            null
        });
      }
    }

    return NextResponse.json({ source: "api", videos, channels });
  } catch {
    const mock = filterMock(query);
    return NextResponse.json({ source: "mock", videos: mock.videos, channels: mock.channels });
  }
}
