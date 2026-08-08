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
      // Extract tvg-name
      const nameMatch = line.match(/tvg-name="([^"]*)"/);
      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      // Extract group-title
      const groupMatch = line.match(/group-title="([^"]*)"/);
      // Extract item name (after the last comma)
      const commaIndex = line.lastIndexOf(",");
      const rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : (nameMatch?.[1] || "Unknown");

      currentItem = {
        id: Math.random().toString(36).substring(7),
        name: nameMatch?.[1] || rawName,
        logo: logoMatch?.[1] || "",
        group: groupMatch?.[1] || "Uncategorized",
        rawName: rawName,
      };
    } else if (line.startsWith("http")) {
      currentItem.url = line;
      
      // LOGICA DE SEPARAÇÃO INTELIGENTE DO MAGO
      if (line.includes("/movie/")) {
        currentItem.type = "movie";
      } else if (line.includes("/series/")) {
        currentItem.type = "series";
        
        // Extrair temporada e episódio do nome (ex: S01E01 ou 1x01)
        const sMatch = currentItem.rawName?.match(/S(\d+)E(\d+)/i) || currentItem.rawName?.match(/(\d+)x(\d+)/i);
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

  // Organizar em categorias
  const result: M3UParsed = {
    movies: [],
    series: [],
    live: [],
  };

  // Process Movies
  const movieGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "movie").forEach(item => {
    const group = item.group;
    if (!movieGroups.has(group)) movieGroups.set(group, []);
    movieGroups.get(group)!.push(item);
  });
  movieGroups.forEach((items, name) => result.movies.push({ name, items }));

  // Process Live
  const liveGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "live").forEach(item => {
    const group = item.group;
    if (!liveGroups.has(group)) liveGroups.set(group, []);
    liveGroups.get(group)!.push(item);
  });
  liveGroups.forEach((items, name) => result.live.push({ name, items }));

  // Process Series (More complex: Group by Name -> Season -> Episodes)
  const seriesMap = new Map<string, Map<string, M3UItem[]>>();
  items.filter(i => i.type === "series").forEach(item => {
    // Try to clean name from SxxExx
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
