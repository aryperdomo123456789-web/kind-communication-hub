import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SSH } from "ssh2-promise";
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

function normalizeApiBaseUrl(ip: string, baseUrl?: string): string {
  if (baseUrl && baseUrl.trim()) {
    return baseUrl.trim().replace(/\/+$/g, "");
  }
  return `http://${ip}:80`;
}

async function runRemoteScript(conn: SSH, script: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const stdout = await conn.exec(script);
    return { code: 0, stdout: String(stdout), stderr: "" };
  } catch (err: any) {
    return { code: 1, stdout: "", stderr: err.message || "Execution error" };
  }
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

  const firstPath = pathCandidates[0] || "/streamer/api/v3/streams";
  return {
    ok: false,
    message: "API do Flussonic não respondeu nos endpoints testados.",
    endpoint: `${baseUrl}${firstPath.startsWith("/") ? firstPath : `/${firstPath}`}`,
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

  return {
    state,
    sshOk: input.sshOk,
    apiOk: input.apiOk,
    lastCheck: new Date().toISOString(),
    message: `${input.sshOk ? "SSH OK" : input.sshMessage || "SSH Falhou"} | ${input.apiOk ? "API OK" : input.apiMessage || "API Falhou"}`,
  };
}

async function checkAndStoreConnectionProfile(
  profile: FlussonicConnectionProfile,
): Promise<{ health: FlussonicConnectionHealth; stored: FlussonicConnectionProfile }> {
  let sshOk = false;
  try {
    const conn = new SSH({
      host: profile.serverIp,
      port: profile.sshPort,
      username: profile.sshUser,
      password: profile.sshPassword || "",
    });
    await conn.connect();
    await conn.close();
    sshOk = true;
  } catch (err) {
    console.error("SSH check failed:", err);
  }

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

  const stored = (await saveFlussonicConnectionProfile({
    ...profile,
    lastHealth: health
  })) as any;

  return { health, stored };
}

export const connectSsh = createServerFn({ method: "POST" })
  .validator(sshConfigSchema)
  .handler(async ({ data }) => {
    try {
      const profile: FlussonicConnectionProfile = {
        panelUsername: data.panelUsername,
        serverIp: data.host,
        sshUser: data.username,
        sshPort: data.port,
        sshPassword: data.password || "",
        apiBaseUrl: data.apiBaseUrl || `http://${data.host}:80`,
        apiUsername: data.apiUsername,
        apiPassword: data.apiPassword,
        apiStreamsPath: data.apiStreamsPath,
        profileId: data.profileId || randomUUID(),
        profileName: data.profileName || `Servidor ${data.host}`,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await checkAndStoreConnectionProfile(profile);
      return {
        success: result.health.state !== "disconnected",
        message: result.health.message,
        health: result.health,
        profile: result.stored,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro desconhecido na conexão SSH.",
      };
    }
  });

export const getPanelAccount = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const account = await getSavedPanelAccount(data.panelUsername);
    return { success: !!account, account };
  });

export const updatePanelAccount = createServerFn({ method: "POST" })
  .validator(panelAccountSchema)
  .handler(async ({ data }) => {
    const account = await savePanelAccount(data.username, data.password);
    return { success: true, message: "Conta atualizada", account };
  });

export const loadFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    const profiles = await listSavedFlussonicConnectionProfiles(data.panelUsername);
    const profile = await getSavedFlussonicConnectionProfile(data.panelUsername);
    return { success: true, profile: profile as any, profiles: profiles as any };
  });

export const deleteSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(deleteProfileSchema)
  .handler(async ({ data }) => {
    await deleteFlussonicConnectionProfile(data.panelUsername, data.profileId);
    return { success: true, message: "Removido" };
  });

async function runSshTask<T>(
  server: { ip: string; user: string; pass: string; port: number },
  task: (conn: SSH) => Promise<T>
): Promise<T> {
  const conn = new SSH({
    host: server.ip,
    port: server.port,
    username: server.user,
    password: server.pass,
  });
  await conn.connect();
  try {
    return await task(conn);
  } finally {
    await conn.close();
  }
}

export const fetchFlussonicStreams = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(async ({ data }) => {
    try {
      const streams = await runSshTask(
        { ip: data.serverIp, user: data.sshUser, pass: data.sshPassword || "", port: data.sshPort },
        async (conn) => {
          const res = await conn.exec(`grep -P "^stream " ${data.flussonicConfPath} | awk '{print $2}' | tr -d '{'`);
          return String(res).split("\n").filter(s => s.trim()).map(s => ({ name: s.trim() }));
        }
      );
      return { success: true, streams };
    } catch (err: any) {
      return { success: false, message: err.message, streams: [] };
    }
  });

function buildProvisionScript(data: any) {
  const catSlug = slugify(data.categoryName);
  const chanSlug = data.channelName ? slugify(data.channelName) : "";
  const root = data.mediaRoot.replace(/\/+$/g, "");
  const folder = chanSlug ? `${root}/${catSlug}/${chanSlug}` : `${root}/${catSlug}`;
  const script = `mkdir -p ${folder} && echo "Criado ${folder}"`;
  return { streamName: catSlug, playlistPath: `${folder}/playlist.txt`, script };
}

export const downloadCategoryToServer = createServerFn({ method: "POST" })
  .validator(provisionSchema)
  .handler(async ({ data }) => {
    const { script } = buildProvisionScript(data);
    try {
      await runSshTask(
        { ip: data.serverIp, user: data.sshUser, pass: data.sshPassword || "", port: data.sshPort },
        conn => conn.exec(script)
      );
      return { success: true, message: "Diretório criado no servidor" };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

export const deleteFlussonicChannel = createServerFn({ method: "POST" })
  .validator(deleteChannelSchema)
  .handler(async ({ data }) => {
     try {
      await runSshTask(
        { ip: data.serverIp, user: data.sshUser, pass: data.sshPassword || "", port: data.sshPort },
        conn => conn.exec(`rm -rf ${data.channelPath}`)
      );
      return { success: true, message: "Removido" };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

export const deleteFlussonicCategory = createServerFn({ method: "POST" })
  .validator(deleteCategorySchema)
  .handler(async ({ data }) => {
     try {
      await runSshTask(
        { ip: data.serverIp, user: data.sshUser, pass: data.sshPassword || "", port: data.sshPort },
        conn => conn.exec(`rm -rf ${data.categoryPath}`)
      );
      return { success: true, message: "Removido" };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

export const fetchFlussonicMirror = createServerFn({ method: "POST" })
  .validator(flussonicListSchema)
  .handler(async ({ data }) => {
    return { success: true, message: "Simulado", snapshot: null };
  });

export const startFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(downloadJobSchema)
  .handler(async ({ data }) => {
    return { success: true, message: "Job iniciado (simulado)", jobId: randomUUID() };
  });

export const fetchFlussonicDownloadJobStatus = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Status (simulado)", status: null };
  });
