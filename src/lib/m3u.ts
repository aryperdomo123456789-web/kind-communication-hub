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

export function parseM3U(content: string): M3UParsed {
  const lines = content.split("\n");
  const items: M3UItem[] = [];
  
  let currentItem: Partial<M3UItem> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/tvg-name="([^"]*)"/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const commaIndex = line.lastIndexOf(",");
      const rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : (nameMatch?.[1] || "Unknown");

      const nameStr = nameMatch?.[1] || rawName;
      currentItem = {
        id: Math.random().toString(36).substring(7),
        name: nameStr,
        logo: logoMatch?.[1] || "",
        group: groupMatch?.[1] || "Uncategorized",
        rawName: rawName,
      };
    } else if (line.startsWith("http")) {
      currentItem.url = line;
      
      const currentRawName = currentItem.rawName || "";
      if (line.includes("/movie/")) {
        currentItem.type = "movie";
      } else if (line.includes("/series/")) {
        currentItem.type = "series";
        const sMatch = currentRawName.match(/S(\d+)E(\d+)/i) || currentRawName.match(/(\d+)x(\d+)/i);
        if (sMatch) {
          currentItem.season = sMatch[1].padStart(2, '0');
          currentItem.episode = sMatch[2].padStart(2, '0');
        } else {
          currentItem.season = "01";
          currentItem.episode = "01";
        }
      } else {
        currentItem.type = "live";
      }
      
      if (currentItem.url && currentItem.name) {
        items.push(currentItem as M3UItem);
      }
      currentItem = {};
    }
  }

  const result: M3UParsed = { movies: [], series: [], live: [] };

  const movieGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "movie").forEach(item => {
    const group = item.group;
    if (!movieGroups.has(group)) movieGroups.set(group, []);
    movieGroups.get(group)!.push(item);
  });
  movieGroups.forEach((items, name) => result.movies.push({ name, items }));

  const liveGroups = new Map<string, M3UCategory>();
  items.filter(i => i.type === "live").forEach(item => {
    const groupName = item.group;
    if (!liveGroups.has(groupName)) {
      liveGroups.set(groupName, { name: groupName, items: [] });
    }
    liveGroups.get(groupName)!.items.push(item);
  });
  result.live = Array.from(liveGroups.values());

  const seriesMap = new Map<string, Map<string, M3UItem[]>>();
  items.filter(i => i.type === "series").forEach(item => {
    const cleanName = item.name.replace(/S\d+E\d+/i, "").replace(/\d+x\d+/i, "").trim();
    if (!seriesMap.has(cleanName)) seriesMap.set(cleanName, new Map());
    
    const seasons = seriesMap.get(cleanName)!;
    const seasonNum = item.season || "01";
    if (!seasons.has(seasonNum)) seasons.set(seasonNum, []);
    seasons.get(seasonNum)!.push(item);
  });

  seriesMap.forEach((seasonsMap, seriesName) => {
    const seasons: { number: string; episodes: M3UItem[] }[] = [];
    seasonsMap.forEach((episodes, number) => {
      seasons.push({ number, episodes: episodes.sort((a, b) => Number(a.episode) - Number(b.episode)) });
    });
    result.series.push({ 
      name: seriesName, 
      seasons: seasons.sort((a, b) => Number(a.number) - Number(b.number)) 
    });
  });

  return result;
}
