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
  
  let currentName: string | null = null;
  let currentLogo: string | null = null;
  let currentGroup: string | null = null;
  let currentRawName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/tvg-name="([^"]*)"/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const commaIndex = line.lastIndexOf(",");
      
      let rName = "Unknown";
      if (commaIndex !== -1) {
        rName = line.substring(commaIndex + 1).trim();
      } else if (nameMatch && nameMatch[1]) {
        rName = nameMatch[1];
      }

      currentName = (nameMatch && nameMatch[1]) ? nameMatch[1] : rName;
      currentLogo = (logoMatch && logoMatch[1]) ? logoMatch[1] : "";
      currentGroup = (groupMatch && groupMatch[1]) ? groupMatch[1] : "Uncategorized";
      currentRawName = rName;
    } else if (line.startsWith("http") && currentName !== null) {
      const url = line;
      const rawName = currentRawName || "";
      let type: "movie" | "series" | "live" = "live";
      let season: string | undefined;
      let episode: string | undefined;

      if (url.includes("/movie/")) {
        type = "movie";
      } else if (url.includes("/series/")) {
        type = "series";
        const sMatch = rawName.match(/S(\d+)E(\d+)/i) || rawName.match(/(\d+)x(\d+)/i);
        if (sMatch && sMatch[1] && sMatch[2]) {
          season = sMatch[1].padStart(2, '0');
          episode = sMatch[2].padStart(2, '0');
        } else {
          season = "01";
          episode = "01";
        }
      } else if (url.includes("/live/")) {
        type = "live";
      }

      items.push({
        id: Math.random().toString(36).substring(7),
        name: currentName,
        logo: currentLogo || "",
        group: currentGroup || "Uncategorized",
        url: url,
        type: type,
        season: season,
        episode: episode,
        rawName: rawName,
      });
      
      currentName = null;
      currentLogo = null;
      currentGroup = null;
      currentRawName = null;
    }
  }

  const result: M3UParsed = { movies: [], series: [], live: [] };

  const movieGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "movie").forEach(item => {
    const group = item.group;
    if (!movieGroups.has(group)) movieGroups.set(group, []);
    const list = movieGroups.get(group);
    if (list) list.push(item);
  });
  movieGroups.forEach((items, name) => result.movies.push({ name, items }));

  const liveGroups = new Map<string, M3UCategory>();
  items.filter(i => i.type === "live").forEach(item => {
    const groupName = item.group;
    if (!liveGroups.has(groupName)) {
      liveGroups.set(groupName, { name: groupName, items: [] });
    }
    const cat = liveGroups.get(groupName);
    if (cat) cat.items.push(item);
  });
  result.live = Array.from(liveGroups.values());

  const seriesMap = new Map<string, Map<string, M3UItem[]>>();
  items.filter(i => i.type === "series").forEach(item => {
    const cleanName = item.name.replace(/S\d+E\d+/i, "").replace(/\d+x\d+/i, "").trim();
    if (!seriesMap.has(cleanName)) seriesMap.set(cleanName, new Map());
    
    const seasons = seriesMap.get(cleanName);
    if (seasons) {
      const seasonNum = item.season || "01";
      if (!seasons.has(seasonNum)) seasons.set(seasonNum, []);
      const eps = seasons.get(seasonNum);
      if (eps) eps.push(item);
    }
  });

  seriesMap.forEach((seasonsMap, seriesName) => {
    const seasons: { number: string; episodes: M3UItem[] }[] = [];
    seasonsMap.forEach((episodes, number) => {
      seasons.push({ number, episodes: episodes.sort((a, b) => {
        const epA = parseInt(a.episode || "0");
        const epB = parseInt(b.episode || "0");
        return epA - epB;
      }) });
    });
    result.series.push({ 
      name: seriesName, 
      seasons: seasons.sort((a, b) => {
        const numA = parseInt(a.number || "0");
        const numB = parseInt(b.number || "0");
        return numA - numB;
      }) 
    });
  });

  return result;
}
