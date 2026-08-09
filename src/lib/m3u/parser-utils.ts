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
 *    - Caso não encontre, tenta fallbacks baseados em números sequenciais ou define como S01E01.
 */

export function detectType(urlLower: string, rawName: string): "movie" | "series" | "live" {
  if (urlLower.includes("/movie/")) return "movie";
  if (urlLower.includes("/series/")) return "series";
  if (urlLower.includes("/live/") || urlLower.endsWith(".ts") || urlLower.endsWith(".m3u8"))
    return "live";

  if (rawName.includes("S0") || rawName.includes("E0") || /\d+x\d+/.test(rawName)) return "series";
  if (urlLower.includes("vod") || urlLower.endsWith(".mp4") || urlLower.endsWith(".mkv"))
    return "movie";

  return "live";
}

export function extractSeasonEpisode(rawName: string) {
  const sMatch =
    rawName.match(/S(\d+)E(\d+)/i) ||
    rawName.match(/(\d+)x(\d+)/i) ||
    rawName.match(/Season\s*(\d+).*Episode\s*(\d+)/i);

  if (sMatch && sMatch[1] && sMatch[2]) {
    return {
      season: sMatch[1].padStart(2, "0"),
      episode: sMatch[2].padStart(2, "0"),
    };
  }

  const fallbackMatch = rawName.match(/(\d+)/g);
  if (fallbackMatch && fallbackMatch.length >= 2) {
    const sVal = fallbackMatch[fallbackMatch.length - 2];
    const eVal = fallbackMatch[fallbackMatch.length - 1];
    return {
      season: sVal ? sVal.padStart(2, "0") : "01",
      episode: eVal ? eVal.padStart(2, "0") : "01",
    };
  }

  return { season: "01", episode: "01" };
}
