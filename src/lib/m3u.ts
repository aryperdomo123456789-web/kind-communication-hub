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

/**
 * LÓGICA DE SEPARAÇÃO M3U (MAGO DEV STYLE)
 * 
 * 1. Identificação de Conteúdo:
 *    - FILMES: Identificados pela presença de '/movie/' no link de reprodução.
 *    - SÉRIES: Identificados pela presença de '/series/' no link de reprodução.
 *    - AO VIVO: Conteúdo que não se encaixa nos anteriores ou contém '/live/'.
 * 
 * 2. Extração de Temporadas e Episódios:
 *    - O sistema vasculha o nome bruto buscando padrões 'SxxExx' ou 'xXxx' (ex: S01E01 ou 1x01).
 *    - Caso não encontre, define como S01E01 por padrão.
 * 
 * 3. Organização:
 *    - Filmes e Canais são agrupados pelo 'group-title' da lista original.
 *    - Séries são agrupadas pelo nome limpo (sem tags de temporada/ep) e depois organizadas em sub-objetos de temporadas e episódios.
 */
export async function parseM3U(content: string): Promise<M3UParsed> {
  let finalContent = content;

  // Se o conteúdo parecer uma URL, tentamos buscar a lista
  if (content.trim().startsWith("http")) {
    try {
      // Usamos o nosso proxy para evitar problemas de CORS
      const proxyUrl = `/api/public/m3u?url=${encodeURIComponent(content.trim())}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        finalContent = await response.text();
      }
    } catch (e) {
      console.error("Falha ao buscar M3U via URL, tentando processar como texto plano:", e);
    }
  }

  const lines = finalContent.split("\n");
  const items: M3UItem[] = [];
  
  let currentName: string | null = null;
  let currentLogo: string | null = null;
  let currentGroup: string | null = null;
  let currentRawName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const line = rawLine.trim();
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
      const url = line.split(" ")[0] || ""; // Garante apenas a URL caso venha com metadata
      const rawName = currentRawName || "";
      const urlLower = url.toLowerCase();
      let type: "movie" | "series" | "live" = "live";
      let season: string | undefined;
      let episode: string | undefined;

      // Lógica de separação robusta: prioridade para links /movie/ e /series/
      if (urlLower.includes("/movie/")) {
        type = "movie";
      } else if (urlLower.includes("/series/")) {
        type = "series";
        // Padrões comuns: S01E01, 1x01, Season 1 Episode 1
        const sMatch = rawName.match(/S(\d+)E(\d+)/i) || 
                       rawName.match(/(\d+)x(\d+)/i) ||
                       rawName.match(/Season\s*(\d+).*Episode\s*(\d+)/i);
                       
        if (sMatch && sMatch[1] && sMatch[2]) {
          season = sMatch[1].padStart(2, '0');
          episode = sMatch[2].padStart(2, '0');
        } else {
          // Fallback inteligente: tenta pegar números no final do nome se for série
          const fallbackMatch = rawName.match(/(\d+)/g);
          if (fallbackMatch && fallbackMatch.length >= 2) {
             season = fallbackMatch[fallbackMatch.length - 2].padStart(2, '0');
             episode = fallbackMatch[fallbackMatch.length - 1].padStart(2, '0');
          } else {
            season = "01";
            episode = "01";
          }
        }
      } else if (urlLower.includes("/live/") || urlLower.endsWith(".ts") || urlLower.endsWith(".m3u8")) {
        type = "live";
      } else {
        // Fallback para VODs que não seguem o padrão /movie/ ou /series/
        if (rawName.includes("S0") || rawName.includes("E0") || /\d+x\d+/.test(rawName)) {
          type = "series";
        } else if (urlLower.includes("vod") || urlLower.endsWith(".mp4") || urlLower.endsWith(".mkv")) {
          type = "movie";
        }
      }

      items.push({
        id: Math.random().toString(36).substring(7),
        name: currentName || "Unknown",
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

  // Agrupamento de Filmes
  const movieGroups = new Map<string, M3UItem[]>();
  items.filter(i => i.type === "movie").forEach(item => {
    const group = item.group;
    if (!movieGroups.has(group)) movieGroups.set(group, []);
    const list = movieGroups.get(group);
    if (list) list.push(item);
  });
  movieGroups.forEach((items, name) => result.movies.push({ name, items }));

  // Agrupamento de Canais
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

  // Estruturação de Séries (Série -> Temporada -> Episódio)
  const seriesMap = new Map<string, Map<string, M3UItem[]>>();
  items.filter(i => i.type === "series").forEach(item => {
    // Limpeza de nome para agrupar episódios da mesma série
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
