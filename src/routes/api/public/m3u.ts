import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/m3u")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        if (!url) return new Response("Missing url", { status: 400 });

        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });
          if (!response.ok) {
            return new Response(`Failed to fetch M3U: ${response.statusText}`, {
              status: response.status,
            });
          }
          const data = await response.text();
          return new Response(data, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("Proxy fetch error:", error);
          return new Response(error instanceof Error ? error.message : "Proxy fetch error", {
            status: 500,
          });
        }
      },
    },
  },
});
