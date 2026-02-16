import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { readMessages, subscribeChatMessages } from "@/lib/chat-store";

export const runtime = "nodejs";

function encodeSse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return new Response(JSON.stringify({ error: "Nao autenticado." }), { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(encodeSse(event, payload)));

      send("ready", { ok: true });
      send("messages", { messages: await readMessages() });

      unsubscribe = subscribeChatMessages((message) => {
        send("message", { message });
      });

      keepAlive = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 20_000);
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
