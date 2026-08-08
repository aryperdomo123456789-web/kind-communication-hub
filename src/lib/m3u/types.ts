import { z } from "zod";

export const M3UItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  logo: z.string().optional(),
  group: z.string(),
  url: z.string(),
  type: z.enum(["movie", "series", "live"]),
  season: z.string().optional(),
  episode: z.string().optional(),
  rawName: z.string(),
});

export type M3UItem = z.infer<typeof M3UItemSchema>;

export interface M3UCategory {
  name: string;
  items: M3UItem[];
}

export interface M3UParsed {
  movies: M3UCategory[];
  series: {
    name: string;
    seasons: {
      number: string;
      episodes: M3UItem[];
    }[];
  }[];
  live: M3UCategory[];
}
