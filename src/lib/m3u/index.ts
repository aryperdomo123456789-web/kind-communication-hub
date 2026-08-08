import { M3UItem, M3UParsed, M3UCategory } from "./types";
import { detectType, extractSeasonEpisode } from "./parser-utils";

export async function parseM3U(content: string): Promise<M3UParsed> {
  let finalContent = content;

  if (content.trim().startsWith("http")) {
    try {
      const proxyUrl = `/api/public/m3u?url=${encodeURIComponent(content.trim())}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        finalContent = await response.text();
      }
    } catch (e) {
      console.error("Falha ao buscar M3U via URL:", e);
    }
  }

  const lines = finalContent.split("\n");
  const items: M3UItem[] = [];
  
  let currentName: string | null = null;
  let currentLogo: string | null = null;
  let currentGroup: string | null = null;
  let currentRawName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
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
    } else if (line.startsWith("http") && (currentName !== null || currentRawName !== null)) {
      const url = line.split(" ")[0] || "";
      const rawName = currentRawName || currentName || "Unknown";
      const type = detectType(url.toLowerCase(), rawName);
      let season, episode;

      if (type === "series") {
        ({ season, episode } = extractSeasonEpisode(rawName));
      }

      items.push({
        id: `id-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`,
        name: currentName || rawName || "Unknown",
        logo: currentLogo || "",
        group: currentGroup || "Uncategorized",
        url,
        type,
        season,
        episode,
        rawName,
      });
      
      currentName = null; currentLogo = null; currentGroup = null; currentRawName = null;
    }

  }

  return groupItems(items);
}

function groupItems(items: M3UItem[]): M3UParsed {
  const result: M3UParsed = { movies: [], series: [], live: [] };

  // Movies
  const movieGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "movie").forEach(item => {
    if (!movieGroups.has(item.group)) movieGroups.set(item.group, []);
    movieGroups.get(item.group)?.push(item);
  });
  movieGroups.forEach((items, name) => result.movies.push({ name, items }));

  // Live
  const liveGroups = new Map<string, M3UCategory>();
  items.filter(i => i.type === "live").forEach(item => {
    if (!liveGroups.has(item.group)) liveGroups.set(item.group, { name: item.group, items: [] });
    liveGroups.get(item.group)?.items.push(item);
  });
  result.live = Array.from(liveGroups.values());

  // Series
  const seriesMap = new Map<string, Map<string, M3UItem[]>>();
  items.filter(i => i.type === "series").forEach(item => {
    const cleanName = item.name.replace(/S\d+E\d+/i, "").replace(/\d+x\d+/i, "").trim();
    if (!seriesMap.has(cleanName)) seriesMap.set(cleanName, new Map());
    
    const seasons = seriesMap.get(cleanName);
    const seasonNum = item.season || "01";
    if (seasons) {
      if (!seasons.has(seasonNum)) seasons.set(seasonNum, []);
      seasons.get(seasonNum)?.push(item);
    }
  });

  seriesMap.forEach((seasonsMap, seriesName) => {
    const seasons: { number: string; episodes: M3UItem[] }[] = [];
    seasonsMap.forEach((episodes, number) => {
      seasons.push({ 
        number, 
        episodes: episodes.sort((a, b) => parseInt(a.episode || "0") - parseInt(b.episode || "0")) 
      });
    });
    result.series.push({ 
      name: seriesName, 
      seasons: seasons.sort((a, b) => parseInt(a.number || "0") - parseInt(b.number || "0")) 
    });
  });

  return result;
}
