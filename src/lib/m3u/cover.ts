import type { M3UItem } from "./types";

const COVER_GRADIENTS = [
  ["#2563eb", "#0f172a"],
  ["#7c3aed", "#111827"],
  ["#0ea5e9", "#082f49"],
  ["#f97316", "#3b1d0a"],
  ["#10b981", "#052e16"],
  ["#ec4899", "#3b0764"],
  ["#eab308", "#422006"],
  ["#ef4444", "#450a0a"],
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(value: string): string {
  const words = value
    .trim()
    .split(/[\s._-]+/g)
    .filter(Boolean);

  if (words.length === 0) return "TV";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] || ""}${words[1]![0] || ""}`.toUpperCase();
}

function getLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 20) return trimmed;
  return `${trimmed.slice(0, 19).trimEnd()}...`;
}

export function getContentCoverDataUrl(item: Pick<M3UItem, "name" | "type" | "group" | "rawName">): string {
  const title = item.name?.trim() || item.rawName?.trim() || item.group?.trim() || "Conteudo";
  const seed = `${title}|${item.type}|${item.group || ""}|${item.rawName || ""}`;
  const gradient = COVER_GRADIENTS[hashString(seed) % COVER_GRADIENTS.length] || COVER_GRADIENTS[0];
  const initials = getInitials(title);
  const label = getLabel(title);
  const typeLabel =
    item.type === "movie" ? "FILME" : item.type === "series" ? "SERIE" : "AO VIVO";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 960" role="img" aria-label="${escapeXml(title)}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${gradient[0]}" />
          <stop offset="100%" stop-color="${gradient[1]}" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="20%" r="80%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.35)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width="640" height="960" rx="44" fill="url(#bg)" />
      <rect width="640" height="960" rx="44" fill="url(#glow)" opacity="0.45" />
      <circle cx="520" cy="140" r="120" fill="rgba(255,255,255,0.08)" />
      <circle cx="120" cy="780" r="180" fill="rgba(0,0,0,0.18)" />
      <g opacity="0.18" stroke="white" stroke-width="10" fill="none">
        <path d="M120 240h400" />
        <path d="M120 280h280" />
        <path d="M120 320h340" />
      </g>
      <g transform="translate(320 360)">
        <circle r="128" fill="rgba(0,0,0,0.26)" />
        <circle r="104" fill="rgba(255,255,255,0.12)" />
        <text x="0" y="26" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="700" fill="white">${escapeXml(initials)}</text>
      </g>
      <rect x="64" y="694" width="512" height="106" rx="24" fill="rgba(0,0,0,0.35)" />
      <text x="96" y="736" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="white">${escapeXml(label)}</text>
      <text x="96" y="778" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="rgba(255,255,255,0.75)">${typeLabel}</text>
      <g transform="translate(482 713)">
        <circle r="32" fill="rgba(255,255,255,0.15)" />
        <path d="M-10 -14L18 0L-10 14Z" fill="white" />
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
