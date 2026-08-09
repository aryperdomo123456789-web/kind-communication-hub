import { createServerFn } from "@tanstack/react-start";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Client } from "ssh2";
import type {
  FlussonicMirrorSnapshot,
  FlussonicChannelInfo,
  FlussonicCategoryInfo,
  FlussonicDownloadJobStatus,
  FlussonicConnectionHealth,
  FlussonicConnectionProfile,
} from "@/lib/m3u/types";
import {
  clearFlussonicConnectionProfile,
  deleteFlussonicConnectionProfile,
  getSavedFlussonicConnectionProfile,
  listSavedFlussonicConnectionProfiles,
  savePanelAccount,
  saveFlussonicConnectionProfile,
  setActiveFlussonicConnectionProfile,
  getSavedPanelAccount,
} from "@/lib/flussonic-connection-store";

const sshConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(22),
  username: z.string().min(1),
  password: z.string().optional().default(""),
  panelUsername: z.string().min(1).default("mago@dono.com"),
  apiBaseUrl: z.string().min(1).optional().default(""),
  apiUsername: z.string().min(1).default("admin"),
  apiPassword: z.string().min(1).default("admin"),
  apiStreamsPath: z.string().min(1).default("/streamer/api/v3/streams"),
  profileId: z.string().min(1).optional(),
  profileName: z.string().min(1).optional(),
});

const panelUsernameSchema = z.object({ panelUsername: z.string().min(1) });
const panelAccountSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
const deleteProfileSchema = z.object({
  panelUsername: z.string().min(1),
  profileId: z.string().min(1),
});

const categoryItemSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
});

const provisionSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  categoryName: z.string().min(1),
  channelName: z.string().optional().default(""),
  items: z.array(categoryItemSchema).min(1),
  mediaRoot: z.string().min(1).default("/opt/flussonic/priv"),
  flussonicConfPath: z.string().min(1).default("/etc/flussonic/flussonic.conf"),
  reloadFlussonic: z.boolean().default(true),
});

const downloadJobSchema = provisionSchema.extend({
  concurrency: z.number().int().min(1).max(8).default(3),
});

const flussonicListSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).default("/etc/flussonic/flussonic.conf"),
});

const flussonicApiSchema = z.object({
  serverIp: z.string().min(1),
  apiBaseUrl: z.string().min(1).optional().default(""),
  apiUsername: z.string().min(1).default("admin"),
  apiPassword: z.string().min(1).default("admin"),
  apiStreamsPath: z.string().min(1).default("/streamer/api/v3/streams"),
});

const deleteChannelSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).default("/etc/flussonic/flussonic.conf"),
  channelPath: z.string().min(1),
  playlistPath: z.string().optional().default(""),
  streamName: z.string().optional().default(""),
});

const deleteCategorySchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).default("/etc/flussonic/flussonic.conf"),
  categoryPath: z.string().min(1),
});

export interface SshResponse {
  success: boolean;
  message: string;
  folder?: string;
  timestamp?: string;
  streamName?: string;
  playlistPath?: string;
  output?: string;
  jobId?: string;
  progress?: number;
  status?: string;
}

export interface FlussonicStreamInfo {
  name: string;
  playlistPath?: string;
}

export interface DownloadJobPlanItem {
  name: string;
  url: string;
  fileName: string;
  playlistLine: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
      .slice(0, 80) || "canal"
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function inferExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{1,5})$/i);
    return match ? `.${match[1].toLowerCase()}` : ".mp4";
  } catch {
    return ".mp4";
  }
}

function sanitizeFileName(name: string, fallbackIndex: number, extension: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 60);

  const prefix = String(fallbackIndex + 1).padStart(3, "0");
  const safeBase = base || `video-${prefix}`;

  return `${prefix}-${safeBase}${extension}`;
}

function buildChannelFolder(
  slugCategory: string,
  slugChannel: string | null,
  mediaRoot: string,
): string {
  const cleanRoot = mediaRoot.replace(/\/+$/g, "");
  if (!slugChannel || slugChannel === slugCategory) {
    return `${cleanRoot}/${slugCategory}`;
  }
  return `${cleanRoot}/${slugCategory}/${slugChannel}`;
}

function buildDownloadJobPlan(input: z.infer<typeof downloadJobSchema>): {
  jobId: string;
  streamName: string;
  playlistPath: string;
  folder: string;
  playlistPrefix: string;
  items: DownloadJobPlanItem[];
} {
  const streamName = slugify(input.categoryName);
  const channelSlug = input.channelName ? slugify(input.channelName) : "";
  const folder = buildChannelFolder(streamName, channelSlug || null, input.mediaRoot);
  const playlistPath = `${folder}/playlist.txt`;
  const playlistPrefix = channelSlug ? `vod/${streamName}/${channelSlug}` : `vod/${streamName}`;

  const items = input.items.map((item, index) => {
    const extension = inferExtension(item.url);
    const fileName = sanitizeFileName(item['name'], index, extension);
    return {
      name: item['name'],
      url: item.url,
      fileName,
      playlistLine: `${playlistPrefix}/${fileName}`,
    };
  });

  return {
    jobId: randomUUID().replace(/-/g, ""),
    streamName,
    playlistPath,
    folder,
    playlistPrefix,
    items,
  };
}

function buildProvisionScript(input: z.infer<typeof provisionSchema>): {
  streamName: string;
  playlistPath: string;
  script: string;
} {
  const streamName = slugify(input.categoryName);
  const channelSlug = input.channelName ? slugify(input.channelName) : "";
  const folder = buildChannelFolder(streamName, channelSlug || null, input.mediaRoot);
  const playlistPath = `${folder}/playlist.txt`;
  const confPath = input.flussonicConfPath;
  const playlistVodPrefix = channelSlug ? `vod/${streamName}/${channelSlug}` : `vod/${streamName}`;

  const downloadSteps = input.items
    .map((item, index) => {
      const extension = inferExtension(item.url);
      const fileName = sanitizeFileName(item['name'], index, extension);
      const filePath = `${folder}/${fileName}`;
      const playlistLine = `${playlistVodPrefix}/${fileName}`;

      return [
        `echo "Baixando ${fileName}..."`,
        `curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -o ${shellQuote(filePath)} ${shellQuote(item.url)}`,
        `printf '%s\\n' ${shellQuote(playlistLine)} >> ${shellQuote(playlistPath)}`,
      ].join("\n");
    })
    .join("\n");

  const script = `
set -euo pipefail

export STREAM_NAME=${shellQuote(streamName)}
export MEDIA_ROOT=${shellQuote(input.mediaRoot.replace(/\/+$/g, ""))}
export FOLDER=${shellQuote(folder)}
export PLAYLIST_PATH=${shellQuote(playlistPath)}
export CONF_PATH=${shellQuote(confPath)}
export RELOAD_FLUSSONIC=${shellQuote(input.reloadFlussonic ? "1" : "0")}

mkdir -p "$FOLDER"
: > "$PLAYLIST_PATH"

${downloadSteps}

python3 - <<'PY'
import os
from pathlib import Path
import re

conf_path = Path(os.environ["CONF_PATH"])
stream_name = os.environ["STREAM_NAME"]
playlist_path = os.environ["PLAYLIST_PATH"]
vod_root = os.environ["MEDIA_ROOT"]

text = conf_path.read_text(encoding="utf-8")

vod_begin = "# BEGIN FLUTES AUTO VOD"
vod_end = "# END FLUTES AUTO VOD"
vod_block = f"""{vod_begin}
vod vod {{
  storage {vod_root};
}}
{vod_end}
"""

if "vod vod {" not in text:
    text = text.rstrip() + "\\n\\n" + vod_block

begin = f"# BEGIN FLUTES AUTO {stream_name}"
end = f"# END FLUTES AUTO {stream_name}"
block = f"""{begin}
stream {stream_name} {{
  input playlist://{playlist_path};
}}
{end}
"""

pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
if pattern.search(text):
    text = pattern.sub(block, text)
else:
    text = text.rstrip() + "\\n\\n" + block

conf_path.write_text(text.rstrip() + "\\n", encoding="utf-8")
PY

if [ "$RELOAD_FLUSSONIC" = "1" ]; then
  service flussonic reload
fi

echo "CANAL_CRIADO:$STREAM_NAME"
echo "PASTA:$FOLDER"
echo "PLAYLIST:$PLAYLIST_PATH"
echo "CONF:$CONF_PATH"
`;

  return { streamName, playlistPath, script };
}

function buildQueuedDownloadScript(input: z.infer<typeof downloadJobSchema>): {
  jobId: string;
  streamName: string;
  playlistPath: string;
  folder: string;
  script: string;
} {
  const plan = buildDownloadJobPlan(input);
  const statusDir = "/tmp/mago-flussonic-downloads";
  const statusPath = `${statusDir}/${plan.jobId}.json`;
  const workerPath = `${statusDir}/${plan.jobId}.py`;
  const itemsJson = JSON.stringify(plan.items);
  const channelSlug = input.channelName ? slugify(input.channelName) : "";
  const reloadFlag = input.reloadFlussonic ? "1" : "0";

  const pythonWorker = `
import concurrent.futures
import json
import os
import re
import shutil
import threading
import time
import traceback
import urllib.request
from pathlib import Path

job_id = os.environ["JOB_ID"]
status_path = Path(os.environ["STATUS_PATH"])
conf_path = Path(os.environ["CONF_PATH"])
folder = Path(os.environ["FOLDER"])
playlist_path = Path(os.environ["PLAYLIST_PATH"])
stream_name = os.environ["STREAM_NAME"]
category_name = os.environ["CATEGORY_NAME"]
channel_name = os.environ.get("CHANNEL_NAME", "")
reload_flag = os.environ.get("RELOAD_FLUSSONIC", "1") == "1"
concurrency = max(1, min(8, int(os.environ.get("CONCURRENCY", "3"))))
items = json.loads(os.environ["ITEMS_JSON"])

lock = threading.Lock()

status = {
    "jobId": job_id,
    "state": "queued",
    "categoryName": category_name,
    "channelName": channel_name or None,
    "streamName": stream_name,
    "folder": str(folder),
    "playlistPath": str(playlist_path),
    "totalItems": len(items),
    "completedItems": 0,
    "failedItems": 0,
    "currentFile": None,
    "percent": 0,
    "items": [
        {
            "name": item["name"],
            "fileName": item["fileName"],
            "url": item["url"],
            "status": "queued",
            "downloadedBytes": 0,
            "totalBytes": None,
        }
        for item in items
    ],
    "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}

def atomic_write(payload):
    status_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = status_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(status_path)

def compute_percent():
    total_bytes = 0
    downloaded_bytes = 0
    known_byte_items = 0

    for item in status["items"]:
        total = item.get("totalBytes")
        if isinstance(total, int) and total > 0:
            known_byte_items += 1
            total_bytes += total
            downloaded_bytes += min(int(item.get("downloadedBytes") or 0), total)

    if total_bytes > 0 and known_byte_items > 0:
        return round((downloaded_bytes / total_bytes) * 100, 2)

    completed = status["completedItems"]
    in_progress = sum(1 for item in status["items"] if item["status"] == "downloading")
    return round(((completed + min(in_progress, 1) * 0.5) / max(len(status["items"]), 1)) * 100, 2)

def write_status():
    status["percent"] = compute_percent()
    status["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    atomic_write(status)

def set_item(index, **updates):
    with lock:
        status["items"][index].update(updates)
        status["currentFile"] = status["items"][index]["fileName"] if updates.get("status") == "downloading" else status.get("currentFile")
        done = sum(1 for item in status["items"] if item["status"] == "done")
        failed = sum(1 for item in status["items"] if item["status"] == "error")
        status["completedItems"] = done
        status["failedItems"] = failed
        write_status()

def build_playlist_and_config():
    folder.mkdir(parents=True, exist_ok=True)
    playlist_path.parent.mkdir(parents=True, exist_ok=True)
    playlist_lines = [item["playlistLine"] for item in items]
    playlist_path.write_text("\\n".join(playlist_lines) + "\\n", encoding="utf-8")

    text = conf_path.read_text(encoding="utf-8", errors="ignore") if conf_path.exists() else ""
    vod_begin = "# BEGIN FLUTES AUTO VOD"
    vod_end = "# END FLUTES AUTO VOD"
    vod_root = os.environ["MEDIA_ROOT"].rstrip("/")
    vod_block = f"""{vod_begin}
vod vod {{
  storage {vod_root};
}}
{vod_end}
"""

    if "vod vod {" not in text:
        text = text.rstrip() + "\\n\\n" + vod_block

    begin = f"# BEGIN FLUTES AUTO {stream_name}"
    end = f"# END FLUTES AUTO {stream_name}"
    block = f"""{begin}
stream {stream_name} {{
  input playlist://{playlist_path};
}}
{end}
"""

    pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
    if pattern.search(text):
        text = pattern.sub(block, text)
    else:
        text = text.rstrip() + "\\n\\n" + block

    conf_path.write_text(text.rstrip() + "\\n", encoding="utf-8")

def download_one(index, item):
    set_item(index, status="downloading")
    destination = folder / item["fileName"]
    temp_path = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(item["url"], headers={"User-Agent": "Mozilla/5.0"})
    downloaded = 0
    total = None

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content_length = response.headers.get("Content-Length")
            if content_length and content_length.isdigit():
                total = int(content_length)

            with open(temp_path, "wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    downloaded += len(chunk)
                    set_item(index, downloadedBytes=downloaded, totalBytes=total)

        temp_path.replace(destination)
        set_item(index, status="done", downloadedBytes=downloaded, totalBytes=total)
    except Exception as exc:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass
        set_item(index, status="error", downloadedBytes=downloaded, totalBytes=total, error=str(exc))
        raise

def main():
    try:
        status["state"] = "running"
        write_status()

        errors = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {executor.submit(download_one, index, item): index for index, item in enumerate(items)}
            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    errors.append(str(exc))

        if errors:
            status["state"] = "failed"
            status["error"] = errors[0]
            status["message"] = "Um ou mais downloads falharam."
            status["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            write_status()
            return

        build_playlist_and_config()
        if reload_flag:
            os.system("service flussonic reload >/dev/null 2>&1")

        status["state"] = "completed"
        status["message"] = "Downloads concluídos com sucesso."
        status["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        status["currentFile"] = None
        status["percent"] = 100
        write_status()
    except Exception as exc:
        status["state"] = "failed"
        status["error"] = f"{exc}"
        status["traceback"] = traceback.format_exc()
        status["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        write_status()

main()
`;

  const script = `
set -euo pipefail

export JOB_ID=${shellQuote(plan.jobId)}
export STATUS_PATH=${shellQuote(statusPath)}
export CONF_PATH=${shellQuote(input.flussonicConfPath)}
export MEDIA_ROOT=${shellQuote(input.mediaRoot.replace(/\/+$/g, ""))}
export FOLDER=${shellQuote(plan.folder)}
export PLAYLIST_PATH=${shellQuote(plan.playlistPath)}
export STREAM_NAME=${shellQuote(plan['streamName'])}
export CATEGORY_NAME=${shellQuote(input.categoryName)}
export CHANNEL_NAME=${shellQuote(input.channelName || "")}
export RELOAD_FLUSSONIC=${shellQuote(reloadFlag)}
export CONCURRENCY=${shellQuote(String(input.concurrency))}
export ITEMS_JSON=${shellQuote(itemsJson)}

mkdir -p ${shellQuote(statusDir)}
cat > ${shellQuote(workerPath)} <<'PY'
${pythonWorker}
PY

nohup python3 -u ${shellQuote(workerPath)} >/dev/null 2>&1 &

printf '%s\\n' ${shellQuote(plan.jobId)}
`;

  return {
    jobId: plan.jobId,
    streamName: plan['streamName'],
    playlistPath: plan.playlistPath,
    folder: plan.folder,
    script,
  };
}

function runRemoteScript(
  conn: Client,
  script: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    conn.exec("bash -se", (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error("Falha ao iniciar o shell remoto."));
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      stream.on("close", (code: number | undefined) => {
        resolve({ code: code ?? 0, stdout, stderr });
      });

      stream.end(script);
    });
  });
}

function resolvePrivateKey() {
  const candidatePaths = ["/root/.ssh/id_rsa", "/root/.ssh/id_ed25519"];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return readFileSync(candidatePath, "utf8");
    }
  }

  return undefined;
}

function connectWithBestAuth(host: string, port: number, username: string, password?: string) {
  const privateKey = resolvePrivateKey();

  return {
    host,
    port,
    username,
    readyTimeout: 20000,
    privateKey,
    password: privateKey ? undefined : password || undefined,
  };
}

function normalizeApiBaseUrl(serverIp: string, apiBaseUrl?: string): string {
  const trimmed = apiBaseUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/g, "");
  return `http://${serverIp}`;
}

function normalizeFlussonicApiUrl(baseUrl: string, rawPath: string): string {
  const pathValue = rawPath.trim() || "/streamer/api/v3/streams";
  const path = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  return `${baseUrl}${path}`;
}

function extractStreamNamesFromApiPayload(payload: unknown): string[] {
  const names = new Set<string>();

  const visit = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const candidates = [record['name'], record['streamName'], record['title'], record['id']];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        names.add(candidate.trim());
        break;
      }
    }

    for (const nestedKey of ["streams", "items", "data", "result"]) {
      const nested = record[nestedKey];
      if (nested) visit(nested);
    }
  };

  visit(payload);
  return [..['name']s].sort((a, b) => a.localeCompare(b));
}

async function fetchFlussonicApiStreamsList(input: z.infer<typeof flussonicApiSchema>): Promise<{
  endpoint: string;
  streams: string[];
}> {
  const baseUrl = normalizeApiBaseUrl(input.serverIp, input.apiBaseUrl);
  const pathCandidates = [
    input.apiStreamsPath,
    "/streamer/api/v3/streams",
    "/api/v3/streams",
    "/admin/api/v3/streams",
    "/streams",
  ];

  for (const rawPath of pathCandidates) {
    const endpoint = normalizeFlussonicApiUrl(baseUrl, rawPath);
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${input.apiUsername}:${input.apiPassword}`).toString("base64")}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        const text = await response.text();
        return { endpoint, streams: extractStreamNamesFromApiPayload(text) };
      }

      const payload = (await response.json()) as unknown;
      return { endpoint, streams: extractStreamNamesFromApiPayload(payload) };
    } catch {
      // Tenta o próximo endpoint candidato.
    }
  }

  throw new Error("API do Flussonic não respondeu nos endpoints testados.");
}

function buildFlussonicPlaybackUrl(baseUrl: string, streamName: string, playbackPath: string): string {
  const cleanPath = playbackPath.trim() || "/index.m3u8";
  const path = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${baseUrl.replace(/\/+$/g, "")}/${encodeURIComponent(streamName)}${path}`;
}

function buildFlussonicPublicPlaylistText(input: {
  baseUrl: string;
  streams: string[];
  preferredPlaybackPath?: string;
}): string {
  const playbackPath = input.preferredPlaybackPath || "/index.m3u8";
  const lines = [
    "#EXTM3U",
    "# Generated by Mago Flussonic Panel",
    `# Primary playback path: ${playbackPath}`,
  ];

  for (const streamName of input.streams) {
    const indexUrl = buildFlussonicPlaybackUrl(input.baseUrl, streamName, playbackPath);
    const videoUrl = buildFlussonicPlaybackUrl(input.baseUrl, streamName, "/video.m3u8");
    const playlistUrl = buildFlussonicPlaybackUrl(input.baseUrl, streamName, "/playlist.m3u8");
    const tsUrl = buildFlussonicPlaybackUrl(input.baseUrl, streamName, "/index.ts.m3u8");

    lines.push(
      `#EXTINF:-1 tvg-id="${streamName}" tvg-name="${streamName}" group-title="Flussonic",${streamName}`,
      indexUrl,
      `# ALT video.m3u8: ${videoUrl}`,
      `# ALT playlist.m3u8: ${playlistUrl}`,
      `# ALT index.ts.m3u8: ${tsUrl}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function checkFlussonicApiHealth(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername: string;
  apiPassword: string;
  apiStreamsPath: string;
}): Promise<{ ok: boolean; message: string; endpoint: string }> {
  const baseUrl = normalizeApiBaseUrl(input.serverIp, input.apiBaseUrl);
  const pathCandidates = [
    input.apiStreamsPath,
    "/streamer/api/v3/streams",
    "/api/v3/streams",
    "/admin/api/v3/streams",
  ];

  for (const rawPath of pathCandidates) {
    const pathValue = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const endpoint = `${baseUrl}${pathValue}`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${input.apiUsername}:${input.apiPassword}`).toString("base64")}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return { ok: true, message: "Flussonic API respondeu com sucesso.", endpoint };
      }
    } catch {
      // Tenta o próximo endpoint candidato.
    }
  }

  return {
    ok: false,
    message: "API do Flussonic não respondeu nos endpoints testados.",
    endpoint: `${baseUrl}${pathCandidates[0].startsWith("/") ? pathCandidates[0] : `/${pathCandidates[0]}`}`,
  };
}

function buildHealthSnapshot(input: {
  sshOk: boolean;
  apiOk: boolean;
  sshMessage?: string;
  apiMessage?: string;
}): FlussonicConnectionHealth {
  const state: FlussonicConnectionHealth["state"] =
    input.sshOk && input.apiOk
      ? "connected"
      : input.sshOk || input.apiOk
        ? "degraded"
        : "disconnected";

  const message =
    state === "connected"
      ? "Conexão persistente validada via SSH e API."
      : state === "degraded"
        ? "Conexão parcial: SSH ou API respondeu, mas não os dois ao mesmo tempo."
        : input.sshMessage || input.apiMessage ||  "Falha ao validar a conexão.";

  return {
    state,
    lastCheckedAt: new Date().toISOString(),
    sshOk: input.sshOk,
    apiOk: input.apiOk,
    message,
  };
}

async function checkAndStoreConnectionProfile(
  profile: FlussonicConnectionProfile,
): Promise<{ health: FlussonicConnectionHealth; stored: FlussonicConnectionProfile }> {
  const sshOk = await new Promise<boolean>((resolve) => {
    const conn = new Client();
    conn
      .on("ready", () => {
        conn.end();
        resolve(true);
      })
      .on("error", () => resolve(false))
      .connect({
        ...connectWithBestAuth(
          profile.serverIp,
          profile.sshPort,
          profile.sshUser,
          profile.sshPassword,
        ),
        readyTimeout: 10000,
      });
  });

  const api = await checkFlussonicApiHealth({
    serverIp: profile.serverIp,
    apiBaseUrl: profile.apiBaseUrl,
    apiUsername: profile.apiUsername,
    apiPassword: profile.apiPassword,
    apiStreamsPath: profile.apiStreamsPath,
  });

  const health = buildHealthSnapshot({
    sshOk,
    apiOk: api.ok,
    sshMessage: sshOk ? "" : "SSH não respondeu.",
    apiMessage: api.ok ? "" : (api.message || "Erro na API"),
  });

  const stored = await saveFlussonicConnectionProfile({
    ...profile,
    lastHealth: health }) as FlussonicConnectionProfile
  });

  return { health, stored };
}

function buildFlussonicListScript(confPath: string): string {
  return `
set -euo pipefail
python3 - <<'PY'
import json
import re
from pathlib import Path

conf_path = Path(${JSON.stringify(confPath)})
text = conf_path.read_text(encoding="utf-8", errors="ignore")

streams = []
pattern = re.compile(r'^\\s*stream\\s+([A-Za-z0-9._-]+)\\s*\\{(.*?)^\\}', re.M | re.S)
for match in pattern.finditer(text):
    name = match.group(1)
    block = match.group(2)
    playlist = None
    input_match = re.search(r'input\\s+playlist://([^\\s;]+)', block)
    if input_match:
        playlist = input_match.group(1)
    streams.append({
        "name": name,
        "playlistPath": playlist,
    })

print(json.dumps({"streams": streams}, ensure_ascii=False))
PY
`;
}

export const validateSshConnection = createServerFn({ method: "POST" })
  .validator(sshConfigSchema)
  .handler(async ({ data }): Promise<SshResponse> => {
    try {
      const storedProfile: FlussonicConnectionProfile = {
        panelUsername: data.panelUsername,
        serverIp: data.host,
        sshUser: data.username,
        sshPort: data.port,
        sshPassword: data.password,
        apiBaseUrl: normalizeApiBaseUrl(data.host, data.apiBaseUrl),
        apiUsername: data.apiUsername,
        apiPassword: data.apiPassword,
        apiStreamsPath: data.apiStreamsPath,
        profileId: data.profileId,
        profileName: data.profileName,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await checkAndStoreConnectionProfile(storedProfile);
      if (!result.health.sshOk) {
        return {
          success: false,
          message: "Falha na conexão SSH. Verifique usuário, senha ou chave autorizada.",
        };
      }

      return {
        success: true,
        message: result.health.apiOk
          ? "Conexão SSH e API do Flussonic validadas com sucesso."
          : "Conexão SSH validada. A API do Flussonic não respondeu, mas o perfil foi salvo.",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao validar a conexão.",
      };
    }
  });

export const fetchFlussonicApiStreams = createServerFn({ method: "POST" })
  .validator(flussonicApiSchema)
  .handler(async ({ data }): Promise<{
    success: boolean;
    message: string;
    endpoint: string;
    streams: string[];
  }> => {
    try {
      const result = await fetchFlussonicApiStreamsList(data);
      return {
        success: true,
        message: result.streams.length
          ? `${result.streams.length} stream${result.streams.length === 1 ? "" : "s"} encontrados via API.`
          : "API respondeu, mas não retornou streams.",
        endpoint: result.endpoint,
        streams: result.streams,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao consultar a API.",
        endpoint: normalizeFlussonicApiUrl(
          normalizeApiBaseUrl(data.serverIp, data.apiBaseUrl),
          data.apiStreamsPath,
        ),
        streams: [],
      };
    }
  });

export const generateFlussonicPublicPlaylist = createServerFn({ method: "POST" })
  .validator(
    flussonicApiSchema.extend({
      preferredPlaybackPath: z.string().min(1).default("/index.m3u8"),
    }),
  )
  .handler(async ({ data }): Promise<{
    success: boolean;
    message: string;
    endpoint: string;
    playlist: string;
    streams: string[];
  }> => {
    try {
      const result = await fetchFlussonicApiStreamsList(data);
      const baseUrl = normalizeApiBaseUrl(data.serverIp, data.apiBaseUrl);
      return {
        success: true,
        message: result.streams.length
          ? `Playlist público gerado com ${result.streams.length} stream${result.streams.length === 1 ? "" : "s"}.`
          : "Playlist gerado, mas nenhuma stream foi encontrada.",
        endpoint: result.endpoint,
        streams: result.streams,
        playlist: buildFlussonicPublicPlaylistText({
          baseUrl,
          streams: result.streams,
          preferredPlaybackPath: data.preferredPlaybackPath,
        }),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao gerar a playlist.",
        endpoint: normalizeFlussonicApiUrl(
          normalizeApiBaseUrl(data.serverIp, data.apiBaseUrl),
          data.apiStreamsPath,
        ),
        playlist: "",
        streams: [],
      };
    }
  });

export const loadFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    }> => {
      const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
      const profile = await getSavedFlussonicConnectionProfile(data.panelUsername);
      if (!profile) {
        return {
          success: true,
          message: "Nenhum perfil salvo encontrado.",
          profile: null,
          profiles,
        };
      }

      return { success: true, message: "Perfil carregado com sucesso.", profile, profiles };
    },
  );

export const refreshFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      health: FlussonicConnectionHealth | null;
      profiles: FlussonicConnectionProfile[];
    }> => {
      const profile = await getSavedFlussonicConnectionProfile(data.panelUsername);
      const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
      if (!profile) {
        return {
          success: false,
          message: "Nenhum perfil de conexão salvo.",
          profile: null,
          health: null,
          profiles,
        };
      }

      const checked = await checkAndStoreConnectionProfile(profile);
      return {
        success: true,
        message: checked.health.message,
        profile: checked.stored,
        health: checked.health,
        profiles,
      };
    },
  );

export const clearFlussonicConnection = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }): Promise<{ success: boolean; message: string }> => {
    await clearFlussonicConnectionProfile(data.panelUsername);
    return { success: true, message: "Perfil de conexão removido." };
  });

export const deleteSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(deleteProfileSchema)
  .handler(async ({ data }): Promise<{ success: boolean; message: string }> => {
    const deleted = await deleteFlussonicConnectionProfile(data.panelUsername, data.profileId);
    return deleted
      ? { success: true, message: "Servidor removido com sucesso." }
      : { success: false, message: "Servidor não encontrado." };
  });

export const activateSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(deleteProfileSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    }> => {
      const profile = await setActiveFlussonicConnectionProfile(data.panelUsername, data.profileId);
      const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
      return profile
        ? { success: true, message: "Servidor ativo alterado.", profile, profiles }
        : { success: false, message: "Servidor não encontrado.", profile: null, profiles };
    },
  );

export const loadPanelAccount = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    success: boolean;
    message: string;
    account: { username: string; password: string };
  }> => {
    const account = await getSavedPanelAccount();
    if (!account) {
      return {
        success: true,
        message: "Conta padrão carregada.",
        account: { username: "mago@dono.com", password: "12345678" },
      };
    }

    return {
      success: true,
      message: "Conta carregada com sucesso.",
      account: {
        username: account.username,
        password: account.password,
      },
    };
  },
);

export const savePanelAccountFn = createServerFn({ method: "POST" })
  .validator(panelAccountSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      account: { username: string; password: string };
    }> => {
      const account = await savePanelAccount({
        username: data.username,
        password: data.password,
      });

      return {
        success: true,
        message: "Conta do painel atualizada.",
        account: {
          username: account.username,
          password: account.password,
        },
      };
    },
  );

export const fetchFlussonicMirror = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      snapshot: FlussonicMirrorSnapshot | null;
    }> => {
      const script = `
set -euo pipefail
python3 - <<'PY'
import json
import os
import re
from pathlib import Path

conf_path = Path(${JSON.stringify(data.flussonicConfPath)})
text = conf_path.read_text(encoding="utf-8", errors="ignore") if conf_path.exists() else ""

storage_root = "/opt/flussonic/priv"
vod_match = re.search(r'vod\\s+vod\\s*\\{.*?storage\\s+([^;\\n]+)', text, re.S)
if vod_match:
    storage_root = vod_match.group(1).strip().strip('"').strip("'")

stream_pattern = re.compile(r'^\\s*stream\\s+([A-Za-z0-9._-]+)\\s*\\{(.*?)^\\}', re.M | re.S)
streams = []
for match in stream_pattern.finditer(text):
    name = match.group(1)
    block = match.group(2)
    input_match = re.search(r'input\\s+playlist://([^\\s;]+)', block)
    playlist_path = input_match.group(1) if input_match else None
    streams.append({"name": name, "playlistPath": playlist_path})

root = Path(storage_root)
categories = []
stream_map = {s["playlistPath"]: s["name"] for s in streams if s.get("playlistPath")}
orphan_streams = [s for s in streams if not s.get("playlistPath")]

if root.exists():
    for category_dir in sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p['name'].lower()):
        channel_entries = []
        total_files = 0
        subdirs = sorted([p for p in category_dir.iterdir() if p.is_dir()], key=lambda p: p['name'].lower())
        if subdirs:
            for channel_dir in subdirs:
                media_files = sorted([f['name'] for f in channel_dir.iterdir() if f.is_file() and f.suffix.lower() in {".mp4", ".mkv", ".ts", ".m3u8"}])
                playlist = channel_dir / "playlist.txt"
                total_files += len(media_files)
                relative_playlist = str(playlist.relative_to(root)) if playlist.exists() else None
                stream_name = stream_map.get(str(playlist)) or stream_map.get(str(playlist).replace("\\\\", "/")) or channel_dir['name']
                channel_entries.append({
                    "name": channel_dir['name'],
                    "streamName": stream_name,
                    "playlistPath": str(playlist) if playlist.exists() else None,
                    "folderPath": str(channel_dir),
                    "mediaFiles": media_files,
                    "mediaCount": len(media_files),
                })
        else:
            media_files = sorted([f['name'] for f in category_dir.iterdir() if f.is_file() and f.suffix.lower() in {".mp4", ".mkv", ".ts", ".m3u8"}])
            playlist = category_dir / "playlist.txt"
            if media_files or playlist.exists():
                total_files += len(media_files)
                stream_name = stream_map.get(str(playlist)) or category_dir['name']
                channel_entries.append({
                    "name": category_dir['name'],
                    "streamName": stream_name,
                    "playlistPath": str(playlist) if playlist.exists() else None,
                    "folderPath": str(category_dir),
                    "mediaFiles": media_files,
                    "mediaCount": len(media_files),
                })

        categories.append({
            "name": category_dir['name'],
            "path": str(category_dir),
            "channels": channel_entries,
            "fileCount": total_files,
            "streamCount": len(channel_entries),
        })

print(json.dumps({
    "storageRoot": storage_root,
    "confPath": str(conf_path),
    "vodConfigured": "vod vod {" in text,
    "streams": streams,
    "categories": categories,
    "orphanStreams": orphan_streams,
}, ensure_ascii=False))
PY
`;

      return new Promise((resolve) => {
        const conn = new Client();

        conn
          .on("ready", async () => {
            try {
              const result = await runRemoteScript(conn, script);
              conn.end();

              if (result.code !== 0) {
                resolve({
                  success: false,
                  message: `Falha ao sincronizar espelho (código ${result.code}).`,
                  snapshot: null,
                });
                return;
              }

              const snapshot = JSON.parse(result.stdout.trim() || "{}") as FlussonicMirrorSnapshot;
              resolve({
                success: true,
                message: "Espelho do Flussonic carregado com sucesso.",
                snapshot,
              });
            } catch (error) {
              conn.end();
              resolve({
                success: false,
                message:
                  error instanceof Error ? error.message : "Erro ao ler espelho do Flussonic.",
                snapshot: null,
              });
            }
          })
          .on("error", (err) => {
            resolve({ success: false, message: `Erro de conexão: ${err.message}`, snapshot: null });
          })
          .connect({
            ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
          });
      });
    },
  );

export const fetchFlussonicStreams = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(
    async ({
      data,
    }): Promise<{ success: boolean; message: string; streams: FlussonicStreamInfo[] }> => {
      return new Promise((resolve) => {
        const conn = new Client();

        conn
          .on("ready", async () => {
            try {
              const result = await runRemoteScript(
                conn,
                buildFlussonicListScript(data.flussonicConfPath),
              );
              conn.end();

              if (result.code !== 0) {
                resolve({
                  success: false,
                  message: `Falha ao ler o Flussonic (código ${result.code}).`,
                  streams: [],
                });
                return;
              }

              const parsed = JSON.parse(result.stdout.trim() || '{"streams":[]}');
              resolve({
                success: true,
                message: "Categorias do Flussonic carregadas com sucesso.",
                streams: Array.isArray(parsed.streams) ? parsed.streams : [],
              });
            } catch (error) {
              conn.end();
              resolve({
                success: false,
                message:
                  error instanceof Error ? error.message : "Erro ao ler categorias do Flussonic.",
                streams: [],
              });
            }
          })
          .on("error", (err) => {
            resolve({ success: false, message: `Erro de conexão: ${err.message}`, streams: [] });
          })
          .connect({
            ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
          });
      });
    },
  );

export const downloadCategoryToServer = createServerFn({ method: "POST" })
  .validator(provisionSchema)
  .handler(async ({ data }): Promise<SshResponse> => {
    const { streamName, playlistPath, script } = buildProvisionScript(data);

    return new Promise((resolve) => {
      const conn = new Client();

      conn
        .on("ready", async () => {
          try {
            const result = await runRemoteScript(conn, script);
            conn.end();

            if (result.code !== 0) {
              resolve({
                success: false,
                message: `O script remoto retornou código ${result.code}.`,
                output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
                streamName,
                playlistPath,
              });
              return;
            }

            resolve({
              success: true,
              message: `Canal ${streamName}${data.channelName ? ` / ${slugify(data.channelName)}` : ""} criado e Flussonic atualizado com sucesso.`,
              folder: buildChannelFolder(
                streamName,
                data.channelName ? slugify(data.channelName) : null,
                data.mediaRoot,
              ),
              streamName,
              playlistPath,
              output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            conn.end();
            resolve({
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Erro desconhecido ao provisionar o canal.",
              streamName,
              playlistPath,
            });
          }
        })
        .on("error", (err) => {
          resolve({ success: false, message: `Erro de conexão: ${err.message}` });
        })
        .connect({
          ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
        });
    });
  });

const downloadJobStatusSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  jobId: z.string().min(1),
});

function buildReadJobStatusScript(jobId: string): string {
  const statusPath = `/tmp/mago-flussonic-downloads/${jobId}.json`;
  return `
set -euo pipefail
python3 - <<'PY'
import json
from pathlib import Path

path = Path(${JSON.stringify(statusPath)})
if not path.exists():
    print(json.dumps({"found": False}, ensure_ascii=False))
else:
    print(json.dumps({"found": True, "status": json.loads(path.read_text(encoding="utf-8"))}, ensure_ascii=False))
PY
`;
}

export const startFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(downloadJobSchema)
  .handler(async ({ data }): Promise<SshResponse> => {
    const plan = buildQueuedDownloadScript(data);

    return new Promise((resolve) => {
      const conn = new Client();

      conn
        .on("ready", async () => {
          try {
            const result = await runRemoteScript(conn, plan.script);
            conn.end();

            if (result.code !== 0) {
              resolve({
                success: false,
                message: `Falha ao iniciar a fila de download (código ${result.code}).`,
                output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              });
              return;
            }

            resolve({
              success: true,
              message: "Fila de download iniciada com sucesso.",
              jobId: plan.jobId,
              streamName: plan['streamName'],
              playlistPath: plan.playlistPath,
              folder: plan.folder,
              output: result.stdout.trim(),
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            conn.end();
            resolve({
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Erro desconhecido ao iniciar a fila de download.",
            });
          }
        })
        .on("error", (err) => {
          resolve({ success: false, message: `Erro de conexão: ${err.message}` });
        })
        .connect({
          ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
        });
    });
  });

export const fetchFlussonicDownloadJobStatus = createServerFn({ method: "POST" })
  .validator(downloadJobStatusSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      message: string;
      status: FlussonicDownloadJobStatus | null;
    }> => {
      return new Promise((resolve) => {
        const conn = new Client();

        conn
          .on("ready", async () => {
            try {
              const result = await runRemoteScript(conn, buildReadJobStatusScript(data.jobId));
              conn.end();

              if (result.code !== 0) {
                resolve({
                  success: false,
                  message: `Falha ao ler o progresso (código ${result.code}).`,
                  status: null,
                });
                return;
              }

              const parsed = JSON.parse(result.stdout.trim() || "{}") as {
                found?: boolean;
                status?: FlussonicDownloadJobStatus;
              };
              if (!parsed.found || !parsed.status) {
                resolve({
                  success: false,
                  message: "Fila de download não encontrada.",
                  status: null,
                });
                return;
              }

              resolve({ success: true, message: "Progresso carregado.", status: parsed.status });
            } catch (error) {
              conn.end();
              resolve({
                success: false,
                message:
                  error instanceof Error ? error.message : "Erro ao consultar o progresso da fila.",
                status: null,
              });
            }
          })
          .on("error", (err) => {
            resolve({ success: false, message: `Erro de conexão: ${err.message}`, status: null });
          })
          .connect({
            ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
          });
      });
    },
  );

function buildDeleteScript(input: {
  confPath: string;
  targetPath: string;
  targetPlaylist?: string;
  targetStreamName?: string;
  removeRootOnly?: boolean;
}): string {
  return `
set -euo pipefail

export CONF_PATH=${shellQuote(input.confPath)}
export TARGET_PATH=${shellQuote(input.targetPath.replace(/\/+$/g, ""))}
export TARGET_PLAYLIST=${shellQuote((input.targetPlaylist || "").replace(/\/+$/g, ""))}
export TARGET_STREAM=${shellQuote(input.targetStreamName || "")}
export REMOVE_ROOT_ONLY=${shellQuote(input.removeRootOnly ? "1" : "0")}

python3 - <<'PY'
import os
import re
import shutil
from pathlib import Path

conf_path = Path(os.environ["CONF_PATH"])
target_path = Path(os.environ["TARGET_PATH"])
target_playlist = os.environ.get("TARGET_PLAYLIST", "").strip()
target_stream = os.environ.get("TARGET_STREAM", "").strip()
remove_root_only = os.environ.get("REMOVE_ROOT_ONLY", "0") == "1"

text = conf_path.read_text(encoding="utf-8", errors="ignore") if conf_path.exists() else ""
original = text

def strip_auto_block(content: str, stream_name: str) -> str:
    begin = f"# BEGIN FLUTES AUTO {stream_name}"
    end = f"# END FLUTES AUTO {stream_name}"
    pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
    return pattern.sub("", content)

def remove_streams_by_playlist(content: str, needle: str) -> str:
    if not needle:
        return content
    pattern = re.compile(r'(^\\s*stream\\s+([A-Za-z0-9._-]+)\\s*\\{.*?^\\s*\\})', re.M | re.S)
    kept = []
    cursor = 0
    for match in pattern.finditer(content):
        kept.append(content[cursor:match.start()])
        block = match.group(1)
        stream_name = match.group(2)
        playlist_match = re.search(r'input\\s+playlist://([^\\s;]+)', block)
        playlist = playlist_match.group(1).rstrip("/") if playlist_match else ""
        if playlist and (playlist == needle or playlist.startswith(needle + "/")):
            cursor = match.end()
            continue
        if stream_name and target_stream and stream_name == target_stream:
            cursor = match.end()
            continue
        kept.append(block)
        cursor = match.end()
    kept.append(content[cursor:])
    return "".join(kept)

text = remove_streams_by_playlist(text, target_playlist or str(target_path))
if target_stream:
    text = strip_auto_block(text, target_stream)
    marker_pattern = re.compile(rf'^\\s*#\\s*(?:BEGIN|END)\\s+FLUTES AUTO\\s+{re.escape(target_stream)}\\s*$', re.M)
    text = marker_pattern.sub('', text)

text = re.sub(r'\\n{3,}', '\\n\\n', text).strip() + '\\n'
if text != original:
    backup = conf_path.with_suffix(conf_path.suffix + ".bak.mago")
    try:
        if conf_path.exists():
            shutil.copy2(conf_path, backup)
    except Exception:
        pass
    conf_path.write_text(text, encoding="utf-8")

if target_path.exists():
    if remove_root_only:
        if target_path.is_dir():
            for child in list(target_path.iterdir()):
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink(missing_ok=True)
    else:
        shutil.rmtree(target_path)

print(f"REMOVIDO:{target_path}")
PY

service flussonic reload
`;
}

export const deleteFlussonicChannel = createServerFn({ method: "POST" })
  .validator(deleteChannelSchema)
  .handler(async ({ data }): Promise<SshResponse> => {
    const script = buildDeleteScript({
      confPath: data.flussonicConfPath,
      targetPath: data.channelPath,
      targetPlaylist: data.playlistPath,
      targetStreamName: data['streamName'],
      removeRootOnly: false,
    });

    return new Promise((resolve) => {
      const conn = new Client();

      conn
        .on("ready", async () => {
          try {
            const result = await runRemoteScript(conn, script);
            conn.end();

            if (result.code !== 0) {
              resolve({
                success: false,
                message: `Falha ao remover o canal (código ${result.code}).`,
                output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              });
              return;
            }

            resolve({
              success: true,
              message: "Canal removido e Flussonic recarregado com sucesso.",
              folder: data.channelPath,
              output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            conn.end();
            resolve({
              success: false,
              message:
                error instanceof Error ? error.message : "Erro desconhecido ao remover o canal.",
            });
          }
        })
        .on("error", (err) => {
          resolve({ success: false, message: `Erro de conexão: ${err.message}` });
        })
        .connect({
          ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
        });
    });
  });

export const deleteFlussonicCategory = createServerFn({ method: "POST" })
  .validator(deleteCategorySchema)
  .handler(async ({ data }): Promise<SshResponse> => {
    const script = buildDeleteScript({
      confPath: data.flussonicConfPath,
      targetPath: data.categoryPath,
      targetPlaylist: data.categoryPath,
      removeRootOnly: false,
    });

    return new Promise((resolve) => {
      const conn = new Client();

      conn
        .on("ready", async () => {
          try {
            const result = await runRemoteScript(conn, script);
            conn.end();

            if (result.code !== 0) {
              resolve({
                success: false,
                message: `Falha ao remover a categoria (código ${result.code}).`,
                output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              });
              return;
            }

            resolve({
              success: true,
              message: "Categoria removida e Flussonic recarregado com sucesso.",
              folder: data.categoryPath,
              output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            conn.end();
            resolve({
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Erro desconhecido ao remover a categoria.",
            });
          }
        })
        .on("error", (err) => {
          resolve({ success: false, message: `Erro de conexão: ${err.message}` });
        })
        .connect({
          ...connectWithBestAuth(data.serverIp, data.sshPort, data.sshUser, data.sshPassword),
        });
    });
  });
