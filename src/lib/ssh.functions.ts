import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { Client } from "ssh2";
import type {
  FlussonicMirrorSnapshot,
  FlussonicStreamInfo,
  FlussonicDownloadItemStatus,
  FlussonicDownloadJobStatus,
  FlussonicConnectionHealth,
  FlussonicConnectionProfile,
} from "@/lib/m3u/types";
import {
  clearFlussonicConnectionProfile,
  deleteFlussonicConnectionProfile,
  deleteSavedCustomCategory,
  appendDownloadJobEvent,
  activateM3UList,
  getDownloadJobSnapshot,
  getLatestActiveDownloadJob,
  getActiveM3UList,
  getSavedFlussonicConnectionProfile,
  getSavedCustomCategories,
  listSavedFlussonicConnectionProfiles,
  listSavedM3ULists,
  listDownloadJobEvents,
  savePanelAccount,
  saveCustomCategories,
  saveDownloadJobSnapshot,
  saveM3UList,
  deactivateM3UList,
  deleteSavedM3UList,
  saveFlussonicConnectionProfile,
  setActiveFlussonicConnectionProfile,
  getSavedPanelAccount,
  type PersistedDownloadJobRecord,
  type SavedM3UListRecord,
} from "@/lib/flussonic-connection-store";

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

export interface FlussonicResponse {
  success: boolean;
  message: string;
}

const DEFAULT_STORAGE_ROOT = "/opt/flussonic/priv";
const DEFAULT_CONF_PATH = "/etc/flussonic/flussonic.conf";
const DEFAULT_API_STREAMS_PATH = "/streamer/api/v3/streams";
const DEFAULT_API_USERNAME = "admin";
const DEFAULT_API_PASSWORD = "admin";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const BROWSER_REFERER = "https://flutes.vr766.com/";

const sshConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(22),
  username: z.string().min(1),
  password: z.string().optional().default(""),
  panelUsername: z.string().min(1).default("mago@dono.com"),
  apiBaseUrl: z.string().min(1).optional().default(""),
  apiUsername: z.string().min(1).default(DEFAULT_API_USERNAME),
  apiPassword: z.string().min(1).default(DEFAULT_API_PASSWORD),
  apiStreamsPath: z.string().min(1).default(DEFAULT_API_STREAMS_PATH),
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
const customCategoriesSchema = z.record(z.array(categoryItemSchema));
const customCategoriesPayloadSchema = z.object({
  panelUsername: z.string().min(1),
  categories: customCategoriesSchema,
});
const customCategoryDeleteSchema = z.object({
  panelUsername: z.string().min(1),
  categoryName: z.string().min(1),
});

const m3uListSchema = z.object({
  panelUsername: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
});

const m3uPanelSchema = z.object({
  panelUsername: z.string().min(1),
});

const provisionSchema = z.object({
  panelUsername: z.string().min(1).default("mago@dono.com"),
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  categoryName: z.string().min(1),
  channelName: z.string().optional().default(""),
  items: z.array(categoryItemSchema).min(1),
  mediaRoot: z.string().min(1).default(DEFAULT_STORAGE_ROOT),
  flussonicConfPath: z.string().min(1).default(DEFAULT_CONF_PATH),
  reloadFlussonic: z.boolean().default(true),
});

const downloadJobSchema = provisionSchema.extend({
  panelUsername: z.string().min(1).default("mago@dono.com"),
  concurrency: z.number().int().min(1).max(8).default(2),
});

type DownloadSourceItem = z.infer<typeof categoryItemSchema>;
type DownloadQueueItem = FlussonicDownloadItemStatus & {
  sourceUrl: string;
  outputPath: string;
  isHls: boolean;
};

type DownloadJobRecord = PersistedDownloadJobRecord & {
  items: DownloadQueueItem[];
  sourceItems: DownloadSourceItem[];
};

const downloadJobs = new Map<string, DownloadJobRecord>();
const downloadJobPersistQueues = new Map<string, Promise<void>>();
const downloadJobExecutionLocks = new Set<string>();

async function persistDownloadJob(job: DownloadJobRecord): Promise<void> {
  const previous = downloadJobPersistQueues.get(job.jobId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => saveDownloadJobSnapshot(job))
    .then(() => undefined)
    .catch((error) => {
      console.error("Falha ao persistir job de download:", error);
    });

  downloadJobPersistQueues.set(job.jobId, next);
  await next;
}

async function recordDownloadJobEvent(input: {
  jobId: string;
  panelUsername: string;
  eventType: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  details?: unknown;
}): Promise<void> {
  try {
    await appendDownloadJobEvent(input);
  } catch (error) {
    console.error("Falha ao registrar evento do job:", error);
  }
}

function buildDownloadPaths(input: {
  mediaRoot: string;
  categoryName: string;
  channelName?: string;
}): { folder: string; playlistPath: string; streamName: string } {
  const streamName = (input.channelName || input.categoryName).trim();
  const categoryName = input.categoryName.trim() || streamName;
  const folder = path.posix.join(normalizeRemoteAbsolutePath(input.mediaRoot || DEFAULT_STORAGE_ROOT), categoryName);
  const playlistPath = buildPlaylistPath(input.mediaRoot || DEFAULT_STORAGE_ROOT, categoryName, streamName);
  return { folder, playlistPath, streamName };
}

function getSourceBaseName(sourceUrl: string, fallback: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const base = path.posix.basename(parsed.pathname || "");
    if (base && base !== "/" && base !== ".") {
      return normalizeDownloadFilename(base.replace(/\.[^.]+$/, ""));
    }
  } catch {
    // ignore malformed URLs and fall back below
  }

  const normalizedFallback = normalizeDownloadFilename(fallback.replace(/\.[^.]+$/, ""));
  return normalizedFallback || "item";
}

function buildDownloadFileName(input: { sourceUrl: string; itemName: string; index: number }): string {
  const baseName = getSourceBaseName(input.sourceUrl, input.itemName);
  const ext = inferDownloadExtension(input.sourceUrl);
  const prefix = String(input.index + 1).padStart(3, "0");
  return `${prefix}-${baseName}${ext}`;
}

function buildVodPlaylistEntry(storageRoot: string, absolutePath: string): string {
  const normalizedStorageRoot = normalizeRemoteAbsolutePath(storageRoot || DEFAULT_STORAGE_ROOT);
  const normalizedAbsolutePath = normalizeRemoteAbsolutePath(absolutePath);
  const relative = normalizedAbsolutePath.startsWith(normalizedStorageRoot)
    ? normalizedAbsolutePath.slice(normalizedStorageRoot.length).replace(/^\/+/g, "")
    : path.posix.basename(normalizedAbsolutePath);
  return `vod/${relative || path.posix.basename(normalizedAbsolutePath)}`;
}

function normalizePlaylistSourceLine(source: string, storageRoot = DEFAULT_STORAGE_ROOT): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("#")) return trimmed;
  if (/^(https?|rtmp|rtsp|srt):\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("playlist://") || trimmed.startsWith("vod/")) return trimmed;
  if (/^file:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return buildVodPlaylistEntry(storageRoot, trimmed);
  }
  return `vod/${trimmed.replace(/^\/+/g, "")}`;
}

function updateDownloadJob(jobId: string, patch: Partial<DownloadJobRecord>): DownloadJobRecord | null {
  const job = downloadJobs.get(jobId);
  if (!job) return null;
  const next = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  } as DownloadJobRecord;
  downloadJobs.set(jobId, next);
  void persistDownloadJob(next);
  return next;
}

function getDownloadJob(jobId: string): DownloadJobRecord | null {
  return downloadJobs.get(jobId) || null;
}

function updateDownloadJobItem(
  jobId: string,
  index: number,
  patch: Partial<DownloadQueueItem>,
): DownloadJobRecord | null {
  const current = getDownloadJob(jobId);
  if (!current) return null;

  const items = current.items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...patch } : entry));
  const summary = summarizeDownloadItems(items);
  return updateDownloadJob(jobId, {
    items,
    completedItems: summary.completedItems,
    failedItems: summary.failedItems,
    totalItems: summary.totalItems,
    percent: summary.percent,
  });
}

function normalizeDownloadFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "item";
}

function inferDownloadExtension(sourceUrl: string): string {
  if (isHlsSource(sourceUrl)) return ".ts";
  try {
    const parsed = new URL(sourceUrl);
    const ext = path.posix.extname(parsed.pathname || "").toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {
    // ignore invalid URLs, default below
  }

  if (/\.m3u8(\?|$)/i.test(sourceUrl)) return ".mp4";
  return ".mp4";
}

function isHlsSource(sourceUrl: string): boolean {
  return /\.m3u8(\?|$)/i.test(sourceUrl);
}

function summarizeDownloadItems(items: DownloadQueueItem[]) {
  const completedItems = items.filter((item) => item.status === "done").length;
  const failedItems = items.filter((item) => item.status === "error").length;
  const totalItems = items.length;
  const percent = totalItems > 0 ? Math.round(((completedItems + failedItems) / totalItems) * 100) : 100;

  return {
    completedItems,
    failedItems,
    totalItems,
    percent,
  };
}

async function probeRemoteContentLength(sourceUrl: string): Promise<number | null> {
  try {
    const response = await fetch(sourceUrl, {
      method: "HEAD",
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        referer: BROWSER_REFERER,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const contentLength = response.headers.get("content-length");
    if (!response.ok || !contentLength) return null;
    const parsed = Number.parseInt(contentLength, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function buildDownloadCommand(input: {
  sourceUrl: string;
  outputPath: string;
  isHls: boolean;
  totalBytes: number | null;
}): string {
  const tempPath = `${input.outputPath}.part`;
  const cleanTemp = `rm -f ${shellQuote(tempPath)}`;
  const totalBytes = Number.isFinite(input.totalBytes || 0) && (input.totalBytes || 0) > 0 ? String(input.totalBytes) : "0";
  const itemTimeout = "30m";
  const timeoutPrefix = `timeout --kill-after=30s ${itemTimeout}`;

  if (input.isHls) {
    const script = [
      "set -euo pipefail",
      `trap '${cleanTemp}' EXIT`,
      `ffmpeg -hide_banner -nostdin -loglevel error -y -user_agent ${shellQuote(BROWSER_USER_AGENT)} -headers ${shellQuote(`Referer: ${BROWSER_REFERER}\\r\\n`)} -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10 -i ${shellQuote(input.sourceUrl)} -c copy -f mpegts ${shellQuote(tempPath)} &`,
      "pid=$!",
      `while kill -0 "$pid" 2>/dev/null; do`,
      `  size=$(stat -c '%s' ${shellQuote(tempPath)} 2>/dev/null || echo 0)`,
      `  echo "__MAGO_PROGRESS__:$size:${totalBytes}"`,
      "  sleep 1",
      "done",
      "wait \"$pid\"",
      `echo "__MAGO_PROGRESS__:done:${totalBytes}"`,
      `mv -f ${shellQuote(tempPath)} ${shellQuote(input.outputPath)}`,
      "trap - EXIT",
    ].join("\n");
    return `${timeoutPrefix} bash -lc ${shellQuote(script)}`;
  }

  const script = [
    "set -euo pipefail",
    `trap '${cleanTemp}' EXIT`,
    `curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 30 --speed-time 30 --speed-limit 1024 -A ${shellQuote(BROWSER_USER_AGENT)} -e ${shellQuote(BROWSER_REFERER)} -o ${shellQuote(tempPath)} ${shellQuote(input.sourceUrl)} &`,
    "pid=$!",
    `while kill -0 "$pid" 2>/dev/null; do`,
    `  size=$(stat -c '%s' ${shellQuote(tempPath)} 2>/dev/null || echo 0)`,
    `  echo "__MAGO_PROGRESS__:$size:${totalBytes}"`,
    "  sleep 1",
    "done",
    "wait \"$pid\"",
    `echo "__MAGO_PROGRESS__:done:${totalBytes}"`,
    `mv -f ${shellQuote(tempPath)} ${shellQuote(input.outputPath)}`,
    "trap - EXIT",
  ].join("\n");
  return `${timeoutPrefix} bash -lc ${shellQuote(script)}`;
}

async function prepareDownloadJob(input: {
  panelUsername: string;
  serverIp: string;
  sshUser: string;
  sshPassword: string;
  sshPort: number;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  mediaRoot: string;
  flussonicConfPath: string;
  reloadFlussonic: boolean;
  categoryName: string;
  channelName?: string;
  items: DownloadSourceItem[];
  concurrency: number;
}): Promise<DownloadJobRecord> {
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  const { folder, playlistPath, streamName } = buildDownloadPaths({
    mediaRoot: input.mediaRoot,
    categoryName: input.categoryName,
    channelName: input.channelName,
  });

  const items = await Promise.all(
    input.items.map(async (source, index) => {
      const outputFileName = buildDownloadFileName({
        sourceUrl: source.url,
        itemName: source.name,
        index,
      });
      const outputPath = path.posix.join(folder, outputFileName);
      const totalBytes = isHlsSource(source.url) ? null : await probeRemoteContentLength(source.url);
      return {
        name: source.name,
        fileName: outputFileName,
        url: source.url,
        status: "queued" as const,
        downloadedBytes: 0,
        totalBytes,
        sourceUrl: source.url,
        outputPath,
        isHls: isHlsSource(source.url),
      };
    }),
  );

  const job: DownloadJobRecord = {
    jobId,
    panelUsername: input.panelUsername,
    state: "queued",
    categoryName: input.categoryName,
    channelName: input.channelName,
    streamName,
    folder,
    playlistPath,
    totalItems: items.length,
    completedItems: 0,
    failedItems: 0,
    currentFile: undefined,
    percent: 0,
    items,
    startedAt: createdAt,
    updatedAt: createdAt,
    message: `Fila preparada para ${items.length} arquivo(s)`,
    serverIp: input.serverIp,
    sshUser: input.sshUser,
    sshPassword: input.sshPassword,
    sshPort: input.sshPort,
    apiBaseUrl: input.apiBaseUrl,
    apiUsername: input.apiUsername,
    apiPassword: input.apiPassword,
    apiStreamsPath: input.apiStreamsPath,
    mediaRoot: input.mediaRoot,
    flussonicConfPath: input.flussonicConfPath,
    reloadFlussonic: input.reloadFlussonic,
    concurrency: Math.max(1, Math.min(2, input.concurrency)),
    sourceItems: input.items,
  };

  downloadJobs.set(jobId, job);
  await persistDownloadJob(job);
  await recordDownloadJobEvent({
    jobId,
    panelUsername: input.panelUsername,
    eventType: "job_created",
    level: "info",
    message: `Fila criada com ${items.length} item(ns)`,
    details: {
      categoryName: input.categoryName,
      channelName: input.channelName,
      concurrency: input.concurrency,
      reloadFlussonic: input.reloadFlussonic,
    },
  });
  return job;
}

async function statRemoteFileSize(client: Client, filePath: string): Promise<number | null> {
  const result = await execRemote(client, `stat -c '%s' ${shellQuote(filePath)}`);
  if (result.code !== 0) return null;
  const parsed = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function writePlaylistForJob(client: Client, playlistPath: string, lines: string[]): Promise<void> {
  await writeRemoteTextFile(client, playlistPath, `${lines.join("\n")}\n`);
}

async function registerDownloadedStream(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  streamName: string;
  playlistPath: string;
}): Promise<void> {
  await upsertFlussonicStreamViaApi({
    serverIp: input.serverIp,
    apiBaseUrl: input.apiBaseUrl || `http://${input.serverIp}`,
    apiUsername: input.apiUsername || DEFAULT_API_USERNAME,
    apiPassword: input.apiPassword || DEFAULT_API_PASSWORD,
    apiStreamsPath: input.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
    streamName: input.streamName,
    playlistPath: input.playlistPath,
  });
}

async function finalizeJobStreamReload(input: {
  serverIp: string;
  sshUser: string;
  sshPassword: string;
  sshPort: number;
  reloadFlussonic: boolean;
}): Promise<{ reloaded: boolean; warning?: string }> {
  if (!input.reloadFlussonic) return { reloaded: false };

  try {
    await withSshConnection(
      {
        host: input.serverIp,
        port: input.sshPort,
        username: input.sshUser,
        password: input.sshPassword,
      },
      async (client) => {
        const result = await execRemote(
          client,
          "service flussonic reload || systemctl reload flussonic || true",
          undefined,
          120000,
        );
        if (result.code !== 0 && result.stderr.trim()) {
          throw new Error(result.stderr);
        }
      },
    );
    return { reloaded: true };
  } catch (error: any) {
    return {
      reloaded: false,
      warning: error?.message || "Falha ao recarregar o Flussonic",
    };
  }
}

async function publishDownloadedJob(
  jobId: string,
  finalState: DownloadJobRecord,
  options: { hasFailure: boolean; eventType: "job_completed" | "job_completed_with_warnings" | "job_republished" | "job_republished_with_warnings"; panelUsername: string },
): Promise<{ reloaded: boolean; warning?: string }> {
  const succeededItems = finalState.items.filter((entry) => entry.status === "done");
  if (succeededItems.length === 0) {
    throw new Error("Nenhum arquivo concluído está disponível para publicar");
  }

  const playlistLines = succeededItems.map((entry) => normalizePlaylistSourceLine(entry.outputPath, finalState.mediaRoot));

  await withSshConnection(
    {
      host: finalState.serverIp,
      port: finalState.sshPort,
      username: finalState.sshUser,
      password: finalState.sshPassword,
    },
    async (client) => {
      await ensureRemoteDir(client, path.posix.dirname(finalState.playlistPath));
      await writePlaylistForJob(client, finalState.playlistPath, playlistLines);
    },
  );

  await registerDownloadedStream({
    serverIp: finalState.serverIp,
    apiBaseUrl: finalState.apiBaseUrl,
    apiUsername: finalState.apiUsername,
    apiPassword: finalState.apiPassword,
    apiStreamsPath: finalState.apiStreamsPath,
    streamName: finalState.streamName,
    playlistPath: finalState.playlistPath,
  });

  const reloadResult = await finalizeJobStreamReload({
    serverIp: finalState.serverIp,
    sshUser: finalState.sshUser,
    sshPassword: finalState.sshPassword,
    sshPort: finalState.sshPort,
    reloadFlussonic: finalState.reloadFlussonic,
  });

  const nextState = options.hasFailure ? "failed" : "completed";
  const nextMessage = options.hasFailure
    ? "Canal publicado com segurança com falhas anteriores na fila"
    : "Fila concluída e canal registrado no Flussonic";

  updateDownloadJob(jobId, {
    state: nextState,
    finishedAt: new Date().toISOString(),
    message: nextMessage,
    error: options.hasFailure ? finalState.error : undefined,
    percent: 100,
    completedItems: succeededItems.length,
    failedItems: finalState.failedItems,
    currentFile: undefined,
  });

  await recordDownloadJobEvent({
    jobId,
    panelUsername: options.panelUsername,
    eventType: options.eventType,
    level: options.hasFailure ? "warning" : "success",
    message: nextMessage,
    details: {
      completedItems: succeededItems.length,
      failedItems: finalState.failedItems,
      reloadFlussonic: finalState.reloadFlussonic,
      manualPublish: options.eventType === "job_republished" || options.eventType === "job_republished_with_warnings",
    },
  });

  if (!reloadResult.reloaded && reloadResult.warning) {
    await recordDownloadJobEvent({
      jobId,
      panelUsername: options.panelUsername,
      eventType: "job_reload_warning",
      level: "warning",
      message: reloadResult.warning,
      details: {
        reloadFlussonic: finalState.reloadFlussonic,
      },
    });
  }

  return reloadResult;
}

async function processDownloadItem(
  jobId: string,
  index: number,
  client: Client,
): Promise<void> {
  const job = getDownloadJob(jobId);
  if (!job) return;

  const item = job.items[index];
  if (!item) return;

  await recordDownloadJobEvent({
    jobId,
    panelUsername: job.panelUsername,
    eventType: "item_started",
    level: "info",
    message: `Iniciando download de ${item.name}`,
    details: {
      index,
      fileName: item.fileName,
      sourceUrl: item.sourceUrl,
    },
  });

  updateDownloadJob(jobId, {
    currentFile: item.fileName,
  });
  updateDownloadJobItem(jobId, index, {
    status: "downloading",
    downloadedBytes: 0,
    totalBytes: item.totalBytes ?? null,
  });

  const progressParser = (() => {
    let buffer = "";
    return (stream: "stdout" | "stderr", chunk: string) => {
      if (stream !== "stdout") return;
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const match = line.trim().match(/^__MAGO_PROGRESS__:(done|\d+):(\d+)$/);
        if (!match) continue;
        const downloadedBytes = match[1] === "done" ? Number.parseInt(match[2], 10) : Number.parseInt(match[1], 10);
        const totalBytes = Number.parseInt(match[2], 10);

        updateDownloadJobItem(jobId, index, {
          downloadedBytes: Number.isFinite(downloadedBytes) ? downloadedBytes : 0,
          totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : item.totalBytes ?? null,
        });
      }
    };
  })();

  const command = buildDownloadCommand({
    sourceUrl: item.sourceUrl,
    outputPath: item.outputPath,
    isHls: item.isHls,
    totalBytes: item.totalBytes,
  });

  const result = await execRemote(client, command, progressParser);
  if (result.code !== 0) {
    await recordDownloadJobEvent({
      jobId,
      panelUsername: job.panelUsername,
      eventType: "item_failed",
      level: "error",
      message: `Falha ao baixar ${item.name}`,
      details: {
        index,
        fileName: item.fileName,
        stderr: result.stderr || "",
        stdout: result.stdout || "",
      },
    });
    throw new Error(result.stderr || result.stdout || `Falha ao baixar ${item.name}`);
  }

  const size = await statRemoteFileSize(client, item.outputPath);
  updateDownloadJobItem(jobId, index, {
    status: "done",
    downloadedBytes: size ?? item.downloadedBytes ?? 0,
    totalBytes: item.totalBytes ?? size ?? null,
  });
  await recordDownloadJobEvent({
    jobId,
    panelUsername: job.panelUsername,
    eventType: "item_completed",
    level: "success",
    message: `Download concluído para ${item.name}`,
    details: {
      index,
      fileName: item.fileName,
      downloadedBytes: size ?? item.downloadedBytes ?? 0,
    },
  });
}

async function executeDownloadJob(jobId: string): Promise<void> {
  if (downloadJobExecutionLocks.has(jobId)) return;
  downloadJobExecutionLocks.add(jobId);

  const initial = getDownloadJob(jobId);
  if (!initial) {
    downloadJobExecutionLocks.delete(jobId);
    return;
  }

  const normalizedItems = initial.items.map((item) =>
    item.status === "downloading"
      ? {
          ...item,
          status: "queued",
          downloadedBytes: item.downloadedBytes || 0,
        }
      : item,
  );

  const normalizedSummary = summarizeDownloadItems(normalizedItems);
  const needsNormalization = normalizedItems.some((item, index) => item !== initial.items[index]);
  if (needsNormalization) {
    updateDownloadJob(jobId, {
      items: normalizedItems,
      ...normalizedSummary,
      currentFile: undefined,
      message: "Retomando fila interrompida",
    });
  }

  let nextIndex = 0;
  let hasFailure = false;
  const concurrency = Math.max(1, Math.min(2, initial.concurrency || 2));
  const queueEntries = normalizedItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status !== "done");
  const publicationRecovery =
    initial.state === "failed" &&
    initial.completedItems === initial.totalItems &&
    initial.totalItems > 0 &&
    queueEntries.length === 0;

  if (publicationRecovery) {
    updateDownloadJob(jobId, {
      state: "running",
      startedAt: initial.startedAt || new Date().toISOString(),
      message: "Recuperando publicação do canal",
    });
  } else {
    updateDownloadJob(jobId, {
      state: "running",
      startedAt: initial.startedAt || new Date().toISOString(),
      message: "Fila iniciada no servidor remoto",
    });
    await recordDownloadJobEvent({
      jobId,
      panelUsername: initial.panelUsername,
      eventType: "job_started",
      level: "info",
      message: "Fila iniciada no servidor remoto",
      details: {
        totalItems: initial.items.length,
        concurrency: initial.concurrency,
        categoryName: initial.categoryName,
        channelName: initial.channelName,
      },
    });
  }

  const getRemainingQueueEntries = () =>
    queueEntries.slice(nextIndex).filter(({ index }) => {
      const currentJob = getDownloadJob(jobId);
      if (!currentJob) return false;
      const currentItem = currentJob.items[index];
      return currentItem ? currentItem.status !== "done" : false;
    });

  const workers = Array.from({ length: Math.min(concurrency, queueEntries.length) }, async (_, workerId) =>
    withSshConnection(
      {
        host: initial.serverIp,
        port: initial.sshPort,
        username: initial.sshUser,
        password: initial.sshPassword,
      },
      async (client) => {
        await ensureRemoteDir(client, path.posix.dirname(initial.playlistPath));
        while (true) {
          const remainingEntries = getRemainingQueueEntries();
          if (remainingEntries.length <= 1 && workerId > 0) {
            return;
          }

          const index = nextIndex++;
          const queueEntry = queueEntries[index];
          if (!queueEntry) return;

          try {
            await processDownloadItem(jobId, queueEntry.index, client);
            const snapshot = getDownloadJob(jobId);
            if (!snapshot) return;
            const summary = summarizeDownloadItems(snapshot.items);
            updateDownloadJob(jobId, {
              ...summary,
              message: `Baixados ${summary.completedItems}/${summary.totalItems} arquivos`,
            });
          } catch (error: any) {
            hasFailure = true;
            const jobNow = getDownloadJob(jobId);
            if (!jobNow) return;
            updateDownloadJobItem(jobId, queueEntry.index, {
              status: "error",
              error: error?.message || "Falha no download",
            });
            const refreshed = getDownloadJob(jobId);
            if (refreshed) {
              const summary = summarizeDownloadItems(refreshed.items);
              updateDownloadJob(jobId, {
                ...summary,
                message: error?.message || "Falha no download",
              });
            }
          }
        }
      },
    ),
  );

  await Promise.all(workers);

  const finalState = getDownloadJob(jobId);
  if (!finalState) return;

  const succeededItems = finalState.items.filter((entry) => entry.status === "done");
  if (succeededItems.length === 0) {
    updateDownloadJob(jobId, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      message: "Nenhum arquivo foi baixado com sucesso",
      error: "A fila terminou sem arquivos válidos",
      percent: 100,
    });
    await recordDownloadJobEvent({
      jobId,
      panelUsername: initial.panelUsername,
      eventType: "job_failed",
      level: "error",
      message: "Nenhum arquivo foi baixado com sucesso",
      details: {
        totalItems: initial.items.length,
      },
    });
    return;
  }

  try {
    await publishDownloadedJob(jobId, finalState, {
      hasFailure,
      panelUsername: finalState.panelUsername,
      eventType: hasFailure ? "job_completed_with_warnings" : "job_completed",
    });
  } catch (error: any) {
    updateDownloadJob(jobId, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      message: error?.message || "Falha ao finalizar a fila",
      error: error?.message || "Falha ao finalizar a fila",
      percent: 100,
    });
    await recordDownloadJobEvent({
      jobId,
      panelUsername: finalState?.panelUsername || initial.panelUsername,
      eventType: "job_finalize_failed",
      level: "error",
      message: error?.message || "Falha ao finalizar a fila",
      details: {
        error: error?.message || "Falha ao finalizar a fila",
      },
    });
  } finally {
    downloadJobExecutionLocks.delete(jobId);
  }
}

async function startQueuedDownloadJob(input: {
  panelUsername: string;
  serverIp: string;
  sshUser: string;
  sshPassword: string;
  sshPort: number;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  mediaRoot: string;
  flussonicConfPath: string;
  reloadFlussonic: boolean;
  categoryName: string;
  channelName?: string;
  items: DownloadSourceItem[];
  concurrency: number;
}): Promise<DownloadJobRecord> {
  await withSshConnection(
    {
      host: input.serverIp,
      port: input.sshPort,
      username: input.sshUser,
      password: input.sshPassword || "",
    },
    async () => true,
  );

  const job = await prepareDownloadJob(input);
  void executeDownloadJob(job.jobId).catch((error) => {
    updateDownloadJob(job.jobId, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      message: error?.message || "Falha ao executar fila",
      error: error?.message || "Falha ao executar fila",
      percent: 100,
    });
  });

  return job;
}

async function ensureDownloadJobExecution(jobId: string): Promise<DownloadJobRecord | null> {
  const status = getDownloadJob(jobId) || ((await getDownloadJobSnapshot(jobId)) as DownloadJobRecord | null);
  if (!status) return null;

  downloadJobs.set(jobId, status);

  const canAutoRecoverPublication =
    status.state === "failed" &&
    status.completedItems === status.totalItems &&
    status.totalItems > 0 &&
    status.items.every((item) => item.status === "done");

  if ((status.state === "queued" || status.state === "running" || canAutoRecoverPublication) && !downloadJobExecutionLocks.has(jobId)) {
    void executeDownloadJob(jobId).catch((error) => {
      updateDownloadJob(jobId, {
        state: "failed",
        finishedAt: new Date().toISOString(),
        message: error?.message || "Falha ao executar fila",
        error: error?.message || "Falha ao executar fila",
        percent: 100,
      });
    });
  }

  return getDownloadJob(jobId);
}

const flussonicListSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).optional().default(DEFAULT_CONF_PATH),
  apiBaseUrl: z.string().optional(),
  apiUsername: z.string().optional(),
  apiPassword: z.string().optional(),
  apiStreamsPath: z.string().optional(),
});

const deleteChannelSchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).default(DEFAULT_CONF_PATH),
  apiBaseUrl: z.string().optional().default(""),
  apiUsername: z.string().optional().default(DEFAULT_API_USERNAME),
  apiPassword: z.string().optional().default(DEFAULT_API_PASSWORD),
  apiStreamsPath: z.string().optional().default(DEFAULT_API_STREAMS_PATH),
  channelPath: z.string().min(1),
  playlistPath: z.string().optional().default(""),
  streamName: z.string().optional().default(""),
});

const deleteCategorySchema = z.object({
  serverIp: z.string().min(1),
  sshUser: z.string().min(1).default("root"),
  sshPassword: z.string().optional().default(""),
  sshPort: z.number().int().positive().default(22),
  flussonicConfPath: z.string().min(1).default(DEFAULT_CONF_PATH),
  apiBaseUrl: z.string().optional().default(""),
  apiUsername: z.string().optional().default(DEFAULT_API_USERNAME),
  apiPassword: z.string().optional().default(DEFAULT_API_PASSWORD),
  apiStreamsPath: z.string().optional().default(DEFAULT_API_STREAMS_PATH),
  categoryPath: z.string().min(1),
});

const publicPlaylistSchema = z.object({
  serverIp: z.string().min(1),
  apiBaseUrl: z.string().optional(),
  apiUsername: z.string().optional(),
  apiPassword: z.string().optional(),
  apiStreamsPath: z.string().optional(),
  preferredPlaybackPath: z.string().optional().default("/index.m3u8"),
});

type SshConnectOptions = {
  host: string;
  port: number;
  username: string;
  password?: string;
};

const SSH_CONNECT_TIMEOUT_MS = 30000;
const SSH_CONNECT_RETRIES = 3;

function isRetriableSshConnectError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("connection lost before handshake") ||
    message.includes("handshake") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("ehostunreach") ||
    message.includes("ecanceled") ||
    message.includes("ssh2 client not ready") ||
    message.includes("socket closed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
};

type ExecProgressListener = (stream: "stdout" | "stderr", chunk: string) => void;

type RemoteEntry = {
  type: "file" | "dir";
  name: string;
  path: string;
};

type ApiStream = {
  name: string;
  playlistPath?: string;
  status?: string;
  running?: boolean;
  alive?: boolean;
  clientCount?: number;
  inputBitrate?: number;
  outputBitrate?: number;
  lastAccessAt?: string;
  openedAt?: string;
  stats?: Record<string, unknown>;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/g, "");
}

function normalizeApiBaseUrl(serverIp: string, baseUrl?: string): string {
  const fallback = `http://${serverIp}`;
  if (!baseUrl?.trim()) return fallback;

  const trimmed = baseUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hash.startsWith("#/")) return parsed.origin;
    if (parsed.pathname.toLowerCase().startsWith("/admin")) return parsed.origin;
    return `${parsed.origin}${parsed.pathname === "/" ? "" : stripTrailingSlash(parsed.pathname)}`;
  } catch {
    if (/^https?:\/\//i.test(trimmed)) return stripTrailingSlash(trimmed);
    return `http://${stripTrailingSlash(trimmed)}`;
  }
}

function normalizeApiPath(input?: string, fallback = DEFAULT_API_STREAMS_PATH): string {
  const raw = (input || fallback).trim();
  if (!raw) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function normalizeAbsolutePath(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return stripLeadingSlash(url.pathname || "");
    } catch {
      return stripLeadingSlash(trimmed.replace(/^[a-z]+:\/\//i, ""));
    }
  }
  return stripLeadingSlash(trimmed);
}

function normalizeRemoteAbsolutePath(input?: string): string {
  const normalized = normalizeAbsolutePath(input);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function absoluteFromDisplayPath(displayPath?: string): string {
  if (!displayPath) return "";
  const normalized = displayPath.trim();
  if (!normalized) return "";
  if (normalized.startsWith("/")) return normalized;
  return `/${normalized}`;
}

function streamNameFromPlaylistPath(playlistPath: string): string {
  const absPath = normalizeRemoteAbsolutePath(playlistPath);
  return path.posix.basename(path.posix.dirname(absPath)) || path.posix.basename(absPath);
}

function playlistPathFromInputUrl(inputUrl?: string): string {
  if (!inputUrl) return "";
  const trimmed = inputUrl.trim();
  if (!trimmed) return "";
  const prefixes = ["playlist://", "vod://", "file://"];
  const match = prefixes.find((prefix) => trimmed.startsWith(prefix));
  if (!match) return normalizeAbsolutePath(trimmed);
  const withoutScheme = trimmed.slice(match.length);
  return normalizeAbsolutePath(withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`);
}

function createAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeDateIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseStreamsPayload(payload: unknown): ApiStream[] {
  const rawStreams = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.streams)
      ? (payload as any).streams
      : Array.isArray((payload as any)?.items)
        ? (payload as any).items
        : [];

  return rawStreams
    .map((entry: any) => {
      const name = String(entry?.name ?? entry?.config_on_disk?.name ?? "").trim();
      const rawInput =
        entry?.config_on_disk?.inputs?.[0]?.url ??
        entry?.inputs?.[0]?.url ??
        entry?.inputs?.find?.((item: any) => item?.url)?.url ??
        "";
      const playlistPath = playlistPathFromInputUrl(rawInput);
      const stats = entry?.stats && typeof entry.stats === "object" ? entry.stats : {};
      const running = Boolean(entry?.running ?? stats?.running);
      const status = String(entry?.status ?? stats?.status ?? (running ? "running" : "")).trim() || undefined;
      const clientCountRaw = entry?.client_count ?? stats?.client_count ?? stats?.clientCount;
      const inputBitrateRaw = entry?.input_bitrate ?? stats?.input_bitrate ?? stats?.inputBitrate;
      const outputBitrateRaw = entry?.output_bitrate ?? stats?.output_bitrate ?? stats?.outputBitrate;
      const lastAccessAtRaw = entry?.last_access_at ?? stats?.last_access_at ?? stats?.lastAccessAt;
      const openedAtRaw = entry?.opened_at ?? stats?.opened_at ?? stats?.openedAt;
      return name
        ? {
            name,
            playlistPath,
            status,
            running,
            alive: Boolean(entry?.alive ?? stats?.alive),
            clientCount: Number.isFinite(Number(clientCountRaw)) ? Number(clientCountRaw) : undefined,
            inputBitrate: Number.isFinite(Number(inputBitrateRaw)) ? Number(inputBitrateRaw) : undefined,
            outputBitrate: Number.isFinite(Number(outputBitrateRaw)) ? Number(outputBitrateRaw) : undefined,
            lastAccessAt: normalizeDateIso(lastAccessAtRaw),
            openedAt: normalizeDateIso(openedAtRaw),
            stats: stats && Object.keys(stats).length > 0 ? (stats as Record<string, unknown>) : undefined,
          }
        : null;
    })
    .filter(Boolean) as ApiStream[];
}

async function withSshConnection<T>(config: SshConnectOptions, task: (client: Client) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SSH_CONNECT_RETRIES; attempt += 1) {
    const client = new Client();
    try {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        const onError = (error: unknown) => reject(error);
        client.once("ready", onReady);
        client.once("error", onError);
        client.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password || "",
          readyTimeout: SSH_CONNECT_TIMEOUT_MS,
          keepaliveInterval: 10000,
          keepaliveCountMax: 3,
        });
      });

      try {
        return await task(client);
      } finally {
        try {
          client.end();
        } catch {
          // noop
        }
      }
    } catch (error) {
      lastError = error;
      try {
        client.end();
      } catch {
        // noop
      }

      if (attempt < SSH_CONNECT_RETRIES && isRetriableSshConnectError(error)) {
        await sleep(1500 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao conectar via SSH");
}

async function execRemote(
  client: Client,
  command: string,
  onProgress?: ExecProgressListener,
  timeoutMs?: number,
): Promise<ExecResult> {
  const stream = await new Promise<any>((resolve, reject) => {
    client.exec(command, { pty: false }, (err, channel) => {
      if (err) return reject(err);
      resolve(channel);
    });
  });

  let stdout = "";
  let stderr = "";

  stream.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stdout += text;
    onProgress?.("stdout", text);
  });

  if (stream.stderr) {
    stream.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      onProgress?.("stderr", text);
    });
  }

  let timeoutId: NodeJS.Timeout | undefined;
  const result = await new Promise<ExecResult>((resolve, reject) => {
    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try {
          stream.close?.();
        } catch {
          // noop
        }
        reject(new Error(`Comando remoto excedeu o tempo limite de ${timeoutMs}ms`));
      }, timeoutMs);
    }

    stream.on("close", (code: number, signal: string) => {
      resolve({
        stdout,
        stderr,
        code: typeof code === "number" ? code : 0,
        signal: signal ?? null,
      });
    });
    stream.on("error", reject);
  });

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
}

async function openSftp(client: Client): Promise<any> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err || !sftp) return reject(err || new Error("Falha ao abrir SFTP"));
      resolve(sftp);
    });
  });
}

async function ensureRemoteDir(client: Client, dirPath: string): Promise<void> {
  const result = await execRemote(client, `mkdir -p ${shellQuote(dirPath)}`);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Falha ao criar diretório ${dirPath}`);
  }
}

async function writeRemoteTextFile(client: Client, filePath: string, content: string): Promise<void> {
  await ensureRemoteDir(client, path.posix.dirname(filePath));
  const sftp = await openSftp(client);
  await new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(filePath, {
      flags: "w",
      encoding: "utf8",
      mode: 0o644,
    });
    stream.on("error", reject);
    stream.on("close", () => resolve());
    stream.end(content, "utf8");
  });
}

async function readRemoteTextFile(client: Client, filePath: string): Promise<string> {
  const result = await execRemote(client, `cat ${shellQuote(filePath)}`);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Falha ao ler ${filePath}`);
  }
  return result.stdout;
}

async function removeRemotePath(client: Client, filePath: string): Promise<void> {
  const result = await execRemote(client, `rm -rf -- ${shellQuote(filePath)}`);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Falha ao remover ${filePath}`);
  }
}

async function listRemoteEntries(
  client: Client,
  rootPath: string,
  maxDepth = 3,
): Promise<RemoteEntry[]> {
  const result = await execRemote(
    client,
    `find ${shellQuote(rootPath)} -mindepth 1 -maxdepth ${maxDepth} \\( -type d -o -type f \\) -printf '%y\\t%p\\n' 2>/dev/null`,
  );

  if (result.code !== 0 && !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [typeCode, ...rest] = line.split("\t");
      const absolute = rest.join("\t").trim();
      const type = typeCode === "d" ? "dir" : "file";
      return absolute ? { type, name: path.posix.basename(absolute), path: absolute } : null;
    })
    .filter(Boolean) as RemoteEntry[];
}

async function listTopLevelCategoryNames(client: Client, rootPath: string): Promise<string[]> {
  const result = await execRemote(
    client,
    `find ${shellQuote(rootPath)} -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' 2>/dev/null | sort -u`,
  );

  if (result.code !== 0 && !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildHealthSnapshot(input: {
  sshOk: boolean;
  apiOk: boolean;
  sshMessage?: string;
  apiMessage?: string;
}): FlussonicConnectionHealth {
  return {
    state: input.sshOk && input.apiOk ? "connected" : input.sshOk || input.apiOk ? "degraded" : "disconnected",
    sshOk: input.sshOk,
    apiOk: input.apiOk,
    lastCheckedAt: new Date().toISOString(),
    message: `${input.sshOk ? "SSH OK" : input.sshMessage || "SSH falhou"} | ${input.apiOk ? "API OK" : input.apiMessage || "API falhou"}`,
  };
}

async function checkFlussonicApiHealth(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername: string;
  apiPassword: string;
  apiStreamsPath: string;
}): Promise<{ ok: boolean; message: string; endpoint: string }> {
  const baseUrl = normalizeApiBaseUrl(input.serverIp, input.apiBaseUrl);
  const endpoint = `${baseUrl}${normalizeApiPath(input.apiStreamsPath)}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: createAuthHeader(input.apiUsername, input.apiPassword),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        message: `API status ${response.status}${body ? `: ${body.slice(0, 140)}` : ""}`,
        endpoint,
      };
    }

    return { ok: true, message: "API OK", endpoint };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Falha ao consultar API", endpoint };
  }
}

async function apiRequest<T>(
  input: {
    serverIp: string;
    apiBaseUrl?: string;
    apiUsername: string;
    apiPassword: string;
    apiStreamsPath?: string;
  },
  options: {
    method?: string;
    path?: string;
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<{ endpoint: string; status: number; text: string; json: T | null }> {
  const baseUrl = normalizeApiBaseUrl(input.serverIp, input.apiBaseUrl);
  const endpointPath = normalizeApiPath(options.path || input.apiStreamsPath || DEFAULT_API_STREAMS_PATH);
  const endpoint = `${baseUrl}${endpointPath}`;
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      Authorization: createAuthHeader(input.apiUsername, input.apiPassword),
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 12000),
  });

  const text = await response.text();
  let json: T | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as T;
    } catch {
      json = null;
    }
  }

  return { endpoint, status: response.status, text, json };
}

async function getFlussonicApiStreams(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
}): Promise<{ endpoint: string; streams: ApiStream[]; raw: unknown }> {
  const result = await apiRequest<any>(input as any, {
    method: "GET",
    path: input.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`API status ${result.status}${result.text ? `: ${result.text.slice(0, 160)}` : ""}`);
  }

  const streams = parseStreamsPayload(result.json ?? result.text);
  return { endpoint: result.endpoint, streams, raw: result.json ?? result.text };
}

function buildMirrorFromFilesystem(input: {
  storageRoot: string;
  confPath: string;
  vodConfigured: boolean;
  apiStreams: ApiStream[];
  entries: RemoteEntry[];
}): FlussonicMirrorSnapshot {
  const apiByPlaylistPath = new Map(
    input.apiStreams
      .filter((stream) => stream.playlistPath)
      .map((stream) => [normalizeRemoteAbsolutePath(stream.playlistPath), stream]),
  );

  const storageRootPath = normalizeRemoteAbsolutePath(input.storageRoot);
  const categoryNames = Array.from(
    new Set(
      input.entries
        .filter((entry) => entry.type === "dir")
        .map((entry) => normalizeRemoteAbsolutePath(entry.path))
        .filter((absolutePath) => absolutePath.startsWith(`${storageRootPath}/`))
        .map((absolutePath) => {
          const relative = absolutePath.slice(storageRootPath.length + 1);
          return relative.split("/")[0];
        })
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const categories = categoryNames.map((categoryName) => {
    const categoryPath = path.posix.join(normalizeRemoteAbsolutePath(input.storageRoot), categoryName);
    const categoryPrefix = `${categoryPath}/`;
    const categoryEntries = input.entries.filter((entry) => normalizeRemoteAbsolutePath(entry.path).startsWith(categoryPrefix));
    const directChildren = categoryEntries.filter((entry) => {
      const relative = normalizeRemoteAbsolutePath(entry.path).slice(categoryPrefix.length);
      return !relative.includes("/");
    });

    const childDirs = directChildren.filter((entry) => entry.type === "dir");
    const hasNestedChannels = childDirs.some((dirEntry) => {
      const nestedPrefix = `${normalizeRemoteAbsolutePath(dirEntry.path)}/`;
      return input.entries.some((entry) => normalizeRemoteAbsolutePath(entry.path).startsWith(nestedPrefix));
    });

    const channelFolders = hasNestedChannels
      ? childDirs
      : directChildren.length
        ? [{ type: "dir" as const, name: categoryName, path: categoryPath }]
        : [];

    const channels = channelFolders.map((folder) => {
      const folderPath = normalizeRemoteAbsolutePath(folder.path);
      const folderPrefix = `${folderPath}/`;
      const folderEntries = input.entries.filter((entry) => normalizeRemoteAbsolutePath(entry.path).startsWith(folderPrefix));
      const filesInside = folderEntries.filter((entry) => entry.type === "file");
      const playlistEntry =
        folderEntries.find((entry) => path.posix.basename(entry.path) === "playlist.txt") ||
        folderEntries.find((entry) => entry.type === "file" && entry.path.endsWith(".txt"));
      const playlistAbsolutePath = playlistEntry ? normalizeRemoteAbsolutePath(playlistEntry.path) : "";
      const matchingStream =
        (playlistAbsolutePath ? apiByPlaylistPath.get(playlistAbsolutePath) : undefined) ||
        input.apiStreams.find((stream) => stream.name === path.posix.basename(folderPath));

      return {
        name: path.posix.basename(folderPath),
        streamName: matchingStream?.name || path.posix.basename(folderPath),
        playlistPath: playlistAbsolutePath ? stripLeadingSlash(playlistAbsolutePath) : undefined,
        folderPath,
        mediaFiles: filesInside
          .map((entry) => entry.path)
          .filter((entryPath) => path.posix.basename(entryPath) !== "playlist.txt" && !entryPath.endsWith(".txt"))
          .map((entryPath) => path.posix.basename(entryPath)),
        mediaCount: filesInside.filter(
          (entry) => path.posix.basename(entry.path) !== "playlist.txt" && !entry.path.endsWith(".txt"),
        ).length,
      };
    });

    const fileCount = categoryEntries.filter((entry) => entry.type === "file").length;
    const streamCount = channels.length;

    return {
      name: categoryName,
      path: categoryPath,
      channels,
      fileCount,
      streamCount,
    };
  });

  const seenPlaylistPaths = new Set(
    categories.flatMap((category) =>
      category.channels.map((channel) => normalizeRemoteAbsolutePath(channel.playlistPath || "")),
    ),
  );

  const orphanStreams = input.apiStreams.filter((stream) => {
    if (!stream.playlistPath) return true;
    return !seenPlaylistPaths.has(normalizeRemoteAbsolutePath(stream.playlistPath));
  });

  return {
    storageRoot: storageRootPath,
    confPath: normalizeRemoteAbsolutePath(input.confPath),
    vodConfigured: input.vodConfigured,
    streams: input.apiStreams,
    categories,
    orphanStreams,
  };
}

async function loadMirrorSnapshot(input: {
  serverIp: string;
  sshUser: string;
  sshPassword: string;
  sshPort: number;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  storageRoot?: string;
  confPath?: string;
}): Promise<FlussonicMirrorSnapshot> {
  const storageRoot = input.storageRoot || DEFAULT_STORAGE_ROOT;
  const confPath = input.confPath || DEFAULT_CONF_PATH;
  const apiInput = {
    serverIp: input.serverIp,
    apiBaseUrl: input.apiBaseUrl,
    apiUsername: input.apiUsername || DEFAULT_API_USERNAME,
    apiPassword: input.apiPassword || DEFAULT_API_PASSWORD,
    apiStreamsPath: input.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
  };

  const apiPromise = getFlussonicApiStreams(apiInput).catch(() => ({ endpoint: "", streams: [], raw: null }));

  return withSshConnection(
    {
      host: input.serverIp,
      port: input.sshPort,
      username: input.sshUser,
      password: input.sshPassword,
    },
    async (client) => {
      const [apiResult, confResult, entries] = await Promise.all([
        apiPromise,
        readRemoteTextFile(client, confPath).catch(() => ""),
        listRemoteEntries(client, storageRoot, 3).catch(() => []),
      ]);

      const vodConfigured = /vod\s+vod\s*\{[\s\S]*storage\s+\/opt\/flussonic\/priv/i.test(confResult);
      return buildMirrorFromFilesystem({
        storageRoot,
        confPath,
        vodConfigured,
        apiStreams: apiResult.streams,
        entries,
      });
    },
  );
}

function buildPlaylistPath(storageRoot: string, categoryName: string, channelName: string): string {
  const root = normalizeRemoteAbsolutePath(storageRoot || DEFAULT_STORAGE_ROOT);
  const categoryPart = categoryName.trim();
  const channelPart = channelName.trim();
  if (!categoryPart) {
    return path.posix.join(root, channelPart, "playlist.txt");
  }
  if (stripTrailingSlash(categoryPart.toLowerCase()) === stripTrailingSlash(channelPart.toLowerCase())) {
    return path.posix.join(root, categoryPart, "playlist.txt");
  }
  return path.posix.join(root, categoryPart, channelPart, "playlist.txt");
}

function buildStreamEndpoint(baseUrl: string, streamName: string, preferredPlaybackPath: string): string {
  const safeStream = encodeURIComponent(streamName);
  const playbackPath = preferredPlaybackPath.startsWith("/") ? preferredPlaybackPath : `/${preferredPlaybackPath}`;
  return `${stripTrailingSlash(baseUrl)}/${safeStream}${playbackPath}`;
}

async function upsertFlussonicStreamViaApi(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  streamName: string;
  playlistPath: string;
}): Promise<{ endpoint: string }> {
  const endpointPath = normalizeApiPath(input.apiStreamsPath || DEFAULT_API_STREAMS_PATH);
  const result = await apiRequest<any>(
    {
      serverIp: input.serverIp,
      apiBaseUrl: input.apiBaseUrl,
      apiUsername: input.apiUsername || DEFAULT_API_USERNAME,
      apiPassword: input.apiPassword || DEFAULT_API_PASSWORD,
      apiStreamsPath: endpointPath,
    },
    {
      method: "PUT",
      path: `${endpointPath}/${encodeURIComponent(input.streamName)}`,
      body: {
        inputs: [
          {
            url: `playlist://${normalizeRemoteAbsolutePath(input.playlistPath)}`,
          },
        ],
      },
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Falha ao registrar stream ${input.streamName}: ${result.status}${result.text ? ` - ${result.text}` : ""}`);
  }

  return { endpoint: result.endpoint };
}

async function deleteFlussonicStreamViaApi(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  streamName: string;
}): Promise<void> {
  const endpointPath = normalizeApiPath(input.apiStreamsPath || DEFAULT_API_STREAMS_PATH);
  const result = await apiRequest<any>(
    {
      serverIp: input.serverIp,
      apiBaseUrl: input.apiBaseUrl,
      apiUsername: input.apiUsername || DEFAULT_API_USERNAME,
      apiPassword: input.apiPassword || DEFAULT_API_PASSWORD,
      apiStreamsPath: endpointPath,
    },
    {
      method: "DELETE",
      path: `${endpointPath}/${encodeURIComponent(input.streamName)}`,
      timeoutMs: 30000,
    },
  );

  if (result.status === 404) return;
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Falha ao excluir stream ${input.streamName}: ${result.status}${result.text ? ` - ${result.text}` : ""}`);
  }
}

async function listCurrentStreamsForPaths(input: {
  serverIp: string;
  apiBaseUrl?: string;
  apiUsername?: string;
  apiPassword?: string;
  apiStreamsPath?: string;
  candidatePaths: string[];
}): Promise<ApiStream[]> {
  if (input.candidatePaths.length === 0) return [];
  const { streams } = await getFlussonicApiStreams({
    serverIp: input.serverIp,
    apiBaseUrl: input.apiBaseUrl,
    apiUsername: input.apiUsername,
    apiPassword: input.apiPassword,
    apiStreamsPath: input.apiStreamsPath,
  });
  const candidates = new Set(input.candidatePaths.map((value) => normalizeRemoteAbsolutePath(value)));
  return streams.filter((stream) => stream.playlistPath && candidates.has(normalizeRemoteAbsolutePath(stream.playlistPath)));
}

async function checkAndStoreConnectionProfile(profile: FlussonicConnectionProfile) {
  const sshOk = await withSshConnection(
    {
      host: profile.serverIp,
      port: profile.sshPort,
      username: profile.sshUser,
      password: profile.sshPassword,
    },
    async () => true,
  );

  const api = await checkFlussonicApiHealth({
    serverIp: profile.serverIp,
    apiBaseUrl: profile.apiBaseUrl,
    apiUsername: profile.apiUsername,
    apiPassword: profile.apiPassword,
    apiStreamsPath: profile.apiStreamsPath,
  });

  const health = buildHealthSnapshot({ sshOk, apiOk: api.ok, sshMessage: "SSH OK", apiMessage: api.message });
  const stored = await saveFlussonicConnectionProfile({ ...profile, lastHealth: health });
  return { health, stored };
}

export const connectSsh = createServerFn({ method: "POST" })
  .validator(sshConfigSchema)
  .handler(async ({ data }) => {
    const profile: FlussonicConnectionProfile = {
      panelUsername: data.panelUsername,
      serverIp: data.host,
      sshUser: data.username,
      sshPort: data.port,
      sshPassword: data.password || "",
      apiBaseUrl: normalizeApiBaseUrl(data.host, data.apiBaseUrl || `http://${data.host}`),
      apiUsername: data.apiUsername,
      apiPassword: data.apiPassword,
      apiStreamsPath: normalizeApiPath(data.apiStreamsPath),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileId: data.profileId || randomUUID(),
      profileName: data.profileName || `Servidor ${data.host}`,
      isActive: true,
    };

    try {
      const { health, stored } = await checkAndStoreConnectionProfile(profile);

      return {
        success: health.state !== "disconnected",
        message: health.message,
        health,
        profile: stored as any,
        streams: [],
      } as any;
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Falha ao conectar",
        health: buildHealthSnapshot({ sshOk: false, apiOk: false, sshMessage: "SSH falhou", apiMessage: "API falhou" }),
        profile: null,
        streams: [],
      } as any;
    }
  });

export const getPanelAccount = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const account = await getSavedPanelAccount(data.panelUsername);
    return { success: !!account, message: account ? "Conta carregada" : "Conta não encontrada", account };
  });

export const loadPanelAccount = getPanelAccount;

export const updatePanelAccount = createServerFn({ method: "POST" })
  .validator(panelAccountSchema)
  .handler(async ({ data }) => {
    const account = await savePanelAccount(data.username, data.password);
    return { success: true, message: "Conta atualizada", account };
  });

export const savePanelAccountFn = updatePanelAccount;

export const loadSavedCustomCategories = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const categories = await getSavedCustomCategories(data.panelUsername);
    return { success: true, message: "Categorias carregadas", categories };
  });

export const saveSavedCustomCategories = createServerFn({ method: "POST" })
  .validator(customCategoriesPayloadSchema)
  .handler(async ({ data }) => {
    const categories = await saveCustomCategories(data.panelUsername, data.categories);
    return { success: true, message: "Categorias salvas", categories };
  });

export const deleteSavedCustomCategoryFn = createServerFn({ method: "POST" })
  .validator(customCategoryDeleteSchema)
  .handler(async ({ data }) => {
    const categories = await deleteSavedCustomCategory(data.panelUsername, data.categoryName);
    return { success: true, message: "Categoria removida", categories };
  });

export const loadSavedM3UListsFn = createServerFn({ method: "POST" })
  .validator(m3uPanelSchema)
  .handler(async ({ data }) => {
    const lists = await listSavedM3ULists(data.panelUsername);
    const active = await getActiveM3UList(data.panelUsername);
    return {
      success: true,
      message: "Listas carregadas",
      lists: lists as SavedM3UListRecord[],
      activeList: active as SavedM3UListRecord | null,
    };
  });

export const saveM3UListFn = createServerFn({ method: "POST" })
  .validator(m3uListSchema)
  .handler(async ({ data }) => {
    const lists = await saveM3UList(data.panelUsername, data.name, data.url);
    const active = await getActiveM3UList(data.panelUsername);
    return {
      success: true,
      message: "Lista salva",
      lists: lists as SavedM3UListRecord[],
      activeList: active as SavedM3UListRecord | null,
    };
  });

export const activateM3UListFn = createServerFn({ method: "POST" })
  .validator(z.object({ panelUsername: z.string().min(1), url: z.string().min(1) }))
  .handler(async ({ data }) => {
    const activeList = await activateM3UList(data.panelUsername, data.url);
    const lists = await listSavedM3ULists(data.panelUsername);
    return {
      success: !!activeList,
      message: activeList ? "Lista conectada" : "Lista não encontrada",
      lists: lists as SavedM3UListRecord[],
      activeList: activeList as SavedM3UListRecord | null,
    };
  });

export const deactivateM3UListFn = createServerFn({ method: "POST" })
  .validator(m3uPanelSchema)
  .handler(async ({ data }) => {
    await deactivateM3UList(data.panelUsername);
    const lists = await listSavedM3ULists(data.panelUsername);
    return {
      success: true,
      message: "Lista desconectada",
      lists: lists as SavedM3UListRecord[],
      activeList: null,
    };
  });

export const deleteSavedM3UListFn = createServerFn({ method: "POST" })
  .validator(z.object({ panelUsername: z.string().min(1), url: z.string().min(1) }))
  .handler(async ({ data }) => {
    const lists = await deleteSavedM3UList(data.panelUsername, data.url);
    const active = await getActiveM3UList(data.panelUsername);
    return {
      success: true,
      message: "Lista removida",
      lists: lists as SavedM3UListRecord[],
      activeList: active as SavedM3UListRecord | null,
    };
  });

export const loadFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
    const profile = await getSavedFlussonicConnectionProfile(data.panelUsername);
    return { success: true, profile: profile as any, profiles: profiles as any };
  });

export const refreshFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const profile = await getSavedFlussonicConnectionProfile(data.panelUsername);
    if (!profile) return { success: false, message: "Não encontrado" };
    const checked = await checkAndStoreConnectionProfile(profile);
    const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
    return {
      success: true,
      health: checked.health,
      profile: checked.stored as any,
      profiles: profiles as any,
      message: checked.health.message,
    };
  });

export const activateSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(deleteProfileSchema)
  .handler(async ({ data }) => {
    const profile = await setActiveFlussonicConnectionProfile(data.panelUsername, data.profileId);
    const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
    return { success: true, profile: profile as any, profiles: profiles as any };
  });

export const deleteSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(deleteProfileSchema)
  .handler(async ({ data }) => {
    await deleteFlussonicConnectionProfile(data.panelUsername, data.profileId);
    return { success: true, message: "Removido" };
  });

export const clearFlussonicConnection = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    await clearFlussonicConnectionProfile(data.panelUsername);
    return { success: true, message: "Conexão limpa" };
  });

export const fetchFlussonicStreams = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(async ({ data }) => {
    try {
      const result = await getFlussonicApiStreams({
        serverIp: data.serverIp,
        apiBaseUrl: data.apiBaseUrl,
        apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
        apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
        apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
      });

      return {
        success: true,
        message: `OK (${result.streams.length} streams)`,
        endpoint: result.endpoint,
        streams: result.streams,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Erro ao consultar streams",
        endpoint: `${normalizeApiBaseUrl(data.serverIp, data.apiBaseUrl)}${normalizeApiPath(data.apiStreamsPath)}`,
        streams: [],
      };
    }
  });

export const fetchFlussonicMirror = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(async ({ data }) => {
    try {
      const snapshot = await loadMirrorSnapshot({
        serverIp: data.serverIp,
        sshUser: data.sshUser,
        sshPassword: data.sshPassword,
        sshPort: data.sshPort,
        apiBaseUrl: data.apiBaseUrl,
        apiUsername: data.apiUsername,
        apiPassword: data.apiPassword,
        apiStreamsPath: data.apiStreamsPath,
        storageRoot: DEFAULT_STORAGE_ROOT,
        confPath: data.flussonicConfPath || DEFAULT_CONF_PATH,
      });

      return { success: true, message: "OK", snapshot };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Erro ao montar espelho",
        snapshot: null,
      };
    }
  });

export const startFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(downloadJobSchema)
  .handler(async ({ data }) => {
    try {
      const job = await startQueuedDownloadJob({
        panelUsername: data.panelUsername || "mago@dono.com",
        serverIp: data.serverIp,
        sshUser: data.sshUser,
        sshPassword: data.sshPassword || "",
        sshPort: data.sshPort,
        apiBaseUrl: `http://${data.serverIp}`,
        apiUsername: DEFAULT_API_USERNAME,
        apiPassword: DEFAULT_API_PASSWORD,
        apiStreamsPath: DEFAULT_API_STREAMS_PATH,
        mediaRoot: data.mediaRoot || DEFAULT_STORAGE_ROOT,
        flussonicConfPath: data.flussonicConfPath || DEFAULT_CONF_PATH,
        reloadFlussonic: data.reloadFlussonic,
        categoryName: data.categoryName,
        channelName: data.channelName,
        items: data.items,
        concurrency: data.concurrency,
      });

      return {
        success: true,
        message: job.message || "Job iniciado",
        jobId: job.jobId,
        streamName: job.streamName,
        folder: job.folder,
        playlistPath: job.playlistPath,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Erro ao iniciar fila",
      };
    }
  });

export const fetchFlussonicDownloadJobStatus = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const status = await ensureDownloadJobExecution(data.jobId);
    if (status) {
      downloadJobs.set(data.jobId, status as DownloadJobRecord);
    }
    return {
      success: !!status,
      message: status ? "Status OK" : "Job não encontrado",
      status: status as FlussonicDownloadJobStatus | null,
    };
  });

export const resumeFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const job = await ensureDownloadJobExecution(data.jobId);
    return {
      success: !!job,
      message: job
        ? job.state === "running" || job.state === "queued"
          ? "Job retomado"
          : "Job já finalizado"
        : "Job não encontrado",
      status: job as FlussonicDownloadJobStatus | null,
    };
  });

export const publishFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const status = getDownloadJob(data.jobId) || ((await getDownloadJobSnapshot(data.jobId)) as DownloadJobRecord | null);
    if (!status) {
      return {
        success: false,
        message: "Job não encontrado",
        status: null,
      };
    }

    const finalizedStatus = status as DownloadJobRecord;
    const succeededItems = finalizedStatus.items.filter((item) => item.status === "done");
    if (finalizedStatus.state === "running" || finalizedStatus.state === "queued") {
      return {
        success: false,
        message: "A fila ainda está em andamento",
        status: finalizedStatus as FlussonicDownloadJobStatus,
      };
    }

    if (succeededItems.length === 0) {
      return {
        success: false,
        message: "Nenhum item concluído disponível para publicar",
        status: finalizedStatus as FlussonicDownloadJobStatus,
      };
    }

    try {
      await publishDownloadedJob(data.jobId, finalizedStatus, {
        hasFailure: finalizedStatus.failedItems > 0,
        panelUsername: finalizedStatus.panelUsername,
        eventType: finalizedStatus.failedItems > 0 ? "job_republished_with_warnings" : "job_republished",
      });

      const refreshed = getDownloadJob(data.jobId) || ((await getDownloadJobSnapshot(data.jobId)) as DownloadJobRecord | null);
      return {
        success: true,
        message: finalizedStatus.failedItems > 0
          ? "Canal publicado com segurança"
          : "Canal publicado e sincronizado",
        status: refreshed as FlussonicDownloadJobStatus | null,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Falha ao publicar o canal",
        status: finalizedStatus as FlussonicDownloadJobStatus,
      };
    }
  });

export const fetchLatestFlussonicDownloadJobStatus = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const status = await getLatestActiveDownloadJob(data.panelUsername);
    if (status) {
      downloadJobs.set(status.jobId, status as DownloadJobRecord);
    }
    return {
      success: !!status,
      message: status ? "Job ativo encontrado" : "Nenhum job ativo",
      status: status as FlussonicDownloadJobStatus | null,
    };
  });

export const fetchFlussonicDownloadJobTrace = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const events = await listDownloadJobEvents(data.jobId);
    const status = getDownloadJob(data.jobId) || (await getDownloadJobSnapshot(data.jobId));
    return {
      success: true,
      message: "Linha do tempo carregada",
      status: status as FlussonicDownloadJobStatus | null,
      events,
    };
  });

export const downloadCategoryToServer = createServerFn({ method: "POST" })
  .validator(provisionSchema)
  .handler(async ({ data }) => {
    try {
      const job = await startQueuedDownloadJob({
        panelUsername: data.panelUsername || "mago@dono.com",
        serverIp: data.serverIp,
        sshUser: data.sshUser,
        sshPassword: data.sshPassword || "",
        sshPort: data.sshPort,
        apiBaseUrl: `http://${data.serverIp}`,
        apiUsername: DEFAULT_API_USERNAME,
        apiPassword: DEFAULT_API_PASSWORD,
        apiStreamsPath: DEFAULT_API_STREAMS_PATH,
        mediaRoot: data.mediaRoot || DEFAULT_STORAGE_ROOT,
        flussonicConfPath: data.flussonicConfPath || DEFAULT_CONF_PATH,
        reloadFlussonic: data.reloadFlussonic,
        categoryName: data.categoryName,
        channelName: data.channelName,
        items: data.items.map((item) => ({ name: item.name, url: item.url })),
        concurrency: 2,
      });

      return {
        success: true,
        message: job.message || "Fila iniciada",
        jobId: job.jobId,
        streamName: job.streamName,
        folder: job.folder,
        playlistPath: job.playlistPath,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Erro ao iniciar download",
      };
    }
  });

export const deleteFlussonicChannel = createServerFn({ method: "POST" })
  .validator(deleteChannelSchema)
  .handler(async ({ data }) => {
    const sshData = {
      host: data.serverIp,
      port: data.sshPort,
      username: data.sshUser,
      password: data.sshPassword,
    };
    const absoluteChannelPath = normalizeRemoteAbsolutePath(data.channelPath);
    const absolutePlaylistPath = normalizeRemoteAbsolutePath(
      data.playlistPath || path.posix.join(absoluteChannelPath, "playlist.txt"),
    );
    const streamName = data.streamName || streamNameFromPlaylistPath(absolutePlaylistPath || absoluteChannelPath);

    let streamDeleted = false;
    let filesystemDeleted = false;

    try {
      await deleteFlussonicStreamViaApi({
        serverIp: data.serverIp,
        apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
        apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
        apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
        apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
        streamName,
      });
      streamDeleted = true;

      await withSshConnection(sshData, async (client) => {
        await removeRemotePath(client, absoluteChannelPath);
      });
      filesystemDeleted = true;

      return {
        success: true,
        message: `Canal ${streamName} excluído com sucesso`,
        streamName,
        playlistPath: stripLeadingSlash(absolutePlaylistPath),
      };
    } catch (error: any) {
      if (streamDeleted && !filesystemDeleted) {
        try {
          await upsertFlussonicStreamViaApi({
            serverIp: data.serverIp,
            apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
            apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
            apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
            apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
            streamName,
            playlistPath: absolutePlaylistPath,
          });
        } catch {
          // rollback best-effort
        }
      }

      return {
        success: false,
        message: error?.message || "Erro ao excluir canal",
        streamName,
        playlistPath: stripLeadingSlash(absolutePlaylistPath),
        output: error?.stderr || error?.output || "",
      };
    }
  });

export const deleteFlussonicCategory = createServerFn({ method: "POST" })
  .validator(deleteCategorySchema)
  .handler(async ({ data }) => {
    const sshData = {
      host: data.serverIp,
      port: data.sshPort,
      username: data.sshUser,
      password: data.sshPassword,
    };
    const absoluteCategoryPath = normalizeRemoteAbsolutePath(data.categoryPath);
    const snapshotCandidates: string[] = [];

    let deletedStreams: ApiStream[] = [];
    let folderDeleted = false;

    try {
      await withSshConnection(sshData, async (client) => {
        const entries = await listRemoteEntries(client, absoluteCategoryPath, 3);
        for (const entry of entries) {
          if (entry.type === "file" && entry.path.endsWith(".txt")) {
            snapshotCandidates.push(normalizeRemoteAbsolutePath(entry.path));
          }
        }

        deletedStreams = await listCurrentStreamsForPaths({
          serverIp: data.serverIp,
          apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
          apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
          apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
          apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
          candidatePaths: snapshotCandidates,
        });

        for (const stream of deletedStreams) {
          await deleteFlussonicStreamViaApi({
            serverIp: data.serverIp,
            apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
            apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
            apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
            apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
            streamName: stream.name,
          });
        }

        await removeRemotePath(client, absoluteCategoryPath);
      });
      folderDeleted = true;

      return {
        success: true,
        message: `Categoria ${path.posix.basename(absoluteCategoryPath)} excluída com sucesso`,
        categoryPath: absoluteCategoryPath,
      };
    } catch (error: any) {
      if (!folderDeleted && deletedStreams.length > 0) {
        for (const stream of deletedStreams) {
          try {
            await upsertFlussonicStreamViaApi({
              serverIp: data.serverIp,
              apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
              apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
              apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
              apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
              streamName: stream.name,
              playlistPath: stream.playlistPath ? absoluteFromDisplayPath(stream.playlistPath) : snapshotCandidates[0] || absoluteCategoryPath,
            });
          } catch {
            // rollback best-effort
          }
        }
      }

      return {
        success: false,
        message: error?.message || "Erro ao excluir categoria",
        categoryPath: stripLeadingSlash(absoluteCategoryPath),
        output: error?.stderr || error?.output || "",
      };
    }
  });

export const generateFlussonicPublicPlaylist = createServerFn({ method: "POST" })
  .validator(publicPlaylistSchema)
  .handler(async ({ data }) => {
    try {
      const apiResult = await getFlussonicApiStreams({
        serverIp: data.serverIp,
        apiBaseUrl: data.apiBaseUrl,
        apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
        apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
        apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
      });

      const baseUrl = normalizeApiBaseUrl(data.serverIp, data.apiBaseUrl);
      const playbackPath = data.preferredPlaybackPath || "/index.m3u8";
      const playlist = [
        "#EXTM3U",
        ...apiResult.streams.map((stream) => {
          const url = buildStreamEndpoint(baseUrl, stream.name, playbackPath);
          return `#EXTINF:-1,${stream.name}\n${url}`;
        }),
      ].join("\n");

      return {
        success: true,
        message: "Playlist gerada",
        endpoint: apiResult.endpoint,
        playlist,
        streams: apiResult.streams.map((stream) => stream.name),
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Erro ao gerar playlist",
        endpoint: "",
        playlist: "",
        streams: [],
      };
    }
  });

export const createFlussonicCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      serverIp: z.string().min(1),
      sshUser: z.string().min(1),
      sshPassword: z.string().optional(),
      sshPort: z.number().int().positive().default(22),
      name: z.string().min(1),
      storageRoot: z.string().optional().default(DEFAULT_STORAGE_ROOT),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await withSshConnection(
        {
          host: data.serverIp,
          port: data.sshPort,
          username: data.sshUser,
          password: data.sshPassword || "",
        },
        async (client) => {
          const categoryPath = path.posix.join(normalizeRemoteAbsolutePath(data.storageRoot), data.name);
          await ensureRemoteDir(client, categoryPath);
        },
      );

      return { success: true, message: `Categoria ${data.name} criada com sucesso no servidor` };
    } catch (error: any) {
      return { success: false, message: `Erro SSH: ${error?.message || "falha inesperada"}` };
    }
  });

export const createFlussonicChannel = createServerFn({ method: "POST" })
  .validator(
    z.object({
      serverIp: z.string().min(1),
      sshUser: z.string().min(1),
      sshPassword: z.string().optional(),
      sshPort: z.number().int().positive().default(22),
      name: z.string().min(1),
      category: z.string().optional().default(""),
      videos: z.array(z.string().min(1)),
      storageRoot: z.string().optional().default(DEFAULT_STORAGE_ROOT),
      apiBaseUrl: z.string().optional(),
      apiUsername: z.string().optional(),
      apiPassword: z.string().optional(),
      apiStreamsPath: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const storageRoot = normalizeRemoteAbsolutePath(data.storageRoot);
    const categoryName = (data.category || "").trim();
    const channelName = data.name.trim();
    const categoryPath = categoryName ? path.posix.join(storageRoot, categoryName) : storageRoot;
    const playlistPath = buildPlaylistPath(storageRoot, categoryName || channelName, channelName);
    const streamName = channelName;

    try {
      await withSshConnection(
        {
          host: data.serverIp,
          port: data.sshPort,
          username: data.sshUser,
          password: data.sshPassword || "",
        },
        async (client) => {
          await ensureRemoteDir(client, path.posix.dirname(playlistPath));
          const playlistContent = data.videos
            .map((item) => normalizePlaylistSourceLine(item, storageRoot))
            .filter(Boolean)
            .join("\n");
          await writeRemoteTextFile(client, playlistPath, `${playlistContent}\n`);
        },
      );

      await upsertFlussonicStreamViaApi({
        serverIp: data.serverIp,
        apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
        apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
        apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
        apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
        streamName,
        playlistPath,
      });

      return {
        success: true,
        message: `Canal ${streamName} criado com sucesso e vinculado ao playlist`,
        folder: stripLeadingSlash(path.posix.dirname(playlistPath)),
        playlistPath: stripLeadingSlash(playlistPath),
        streamName,
      };
    } catch (error: any) {
      try {
        await deleteFlussonicStreamViaApi({
          serverIp: data.serverIp,
          apiBaseUrl: data.apiBaseUrl || `http://${data.serverIp}`,
          apiUsername: data.apiUsername || DEFAULT_API_USERNAME,
          apiPassword: data.apiPassword || DEFAULT_API_PASSWORD,
          apiStreamsPath: data.apiStreamsPath || DEFAULT_API_STREAMS_PATH,
          streamName,
        });
      } catch {
        // rollback best-effort
      }

      try {
        await withSshConnection(
          {
            host: data.serverIp,
            port: data.sshPort,
            username: data.sshUser,
            password: data.sshPassword || "",
          },
          async (client) => {
            await removeRemotePath(client, path.posix.dirname(playlistPath));
          },
        );
      } catch {
        // rollback best-effort
      }

      return {
        success: false,
        message: `Erro SSH: ${error?.message || "falha inesperada"}`,
      };
    }
  });

export const listFlussonicCategories = createServerFn({ method: "POST" })
  .validator(
    z.object({
      serverIp: z.string().min(1),
      sshUser: z.string().min(1).default("root"),
      sshPassword: z.string().optional().default(""),
      sshPort: z.number().int().positive().default(22),
      storageRoot: z.string().optional().default(DEFAULT_STORAGE_ROOT),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const categories = await withSshConnection(
        {
          host: data.serverIp,
          port: data.sshPort,
          username: data.sshUser,
          password: data.sshPassword || "",
        },
        async (client) => listTopLevelCategoryNames(client, data.storageRoot || DEFAULT_STORAGE_ROOT),
      );

      return { success: true, categories };
    } catch (error: any) {
      return { success: false, message: `Erro SSH: ${error?.message || "falha inesperada"}`, categories: [] };
    }
  });
