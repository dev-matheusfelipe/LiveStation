import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { readUsers } from "@/lib/user-store";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const users = await readUsers();
  const now = Date.now();

  let onlineUsers = 0;
  let totalActiveVideos = 0;
  let totalWatchSeconds = 0;
  let topWatcherName = "-";
  let topWatcherSeconds = 0;
  for (const user of users) {
    const currentWatchSeconds = Math.max(0, Math.floor(user.watchSeconds ?? 0));
    totalWatchSeconds += currentWatchSeconds;
    if (currentWatchSeconds > topWatcherSeconds) {
      topWatcherSeconds = currentWatchSeconds;
      topWatcherName = user.username || user.displayName || user.email.split("@")[0] || user.email;
    }

    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
    const online = now - lastSeen <= ONLINE_WINDOW_MS;
    if (online) {
      onlineUsers += 1;
      totalActiveVideos += user.activeVideos ?? 0;
    }
  }

  return NextResponse.json({
    totalUsers: users.length,
    onlineUsers,
    offlineUsers: Math.max(0, users.length - onlineUsers),
    totalActiveVideos,
    profilesWithAvatar: users.filter((user) => Boolean(user.avatarDataUrl)).length,
    totalWatchSeconds,
    topWatcherName,
    topWatcherSeconds
  });
}
