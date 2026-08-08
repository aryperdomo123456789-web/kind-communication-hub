import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/m3u")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        if (!url) return new Response("Missing url", { status: 400 });

        try {
          const response = await fetch(url);
          if (!response.ok) {
            return new Response(`Failed to fetch M3U: ${response.statusText}`, { status: response.status });
          }
          const data = await response.text();
          return new Response(data, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e: any) {
          return new Response(e.message, { status: 500 });
        }
      },
    },
  },
});
