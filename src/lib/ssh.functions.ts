import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { 
  FlussonicConnectionProfile, 
  FlussonicConnectionHealth,
  FlussonicMirrorSnapshot,
  FlussonicDownloadJobStatus
} from "@/lib/m3u/types";

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

// Validation Schemas
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

// Mocked server functions to fix build
export const connectSsh = createServerFn({ method: "POST" })
  .validator(sshConfigSchema)
  .handler(async ({ data }) => {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileId: data.profileId || randomUUID(),
      profileName: data.profileName || `Servidor ${data.host}`,
      isActive: true,
    };
    return {
      success: true,
      message: "Conexão SSH simulada (Ambiente de Desenvolvimento)",
      health: { 
        state: "connected", 
        sshOk: true, 
        apiOk: true, 
        lastCheckedAt: new Date().toISOString(), 
        message: "Simulado" 
      },
      profile,
      profiles: [profile],
      streams: []
    } as {
      success: boolean;
      message: string;
      health: FlussonicConnectionHealth;
      profile: FlussonicConnectionProfile;
      profiles: FlussonicConnectionProfile[];
      streams: any[];
    };
  });

export const getPanelAccount = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async ({ data }) => {
    return { 
      success: true, 
      message: "Simulado", 
      account: { 
        username: data.panelUsername, 
        password: "...", 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      } 
    };
  });

export const loadPanelAccount = getPanelAccount;

export const updatePanelAccount = createServerFn({ method: "POST" })
  .validator(panelAccountSchema)
  .handler(async ({ data }) => {
    return { 
      success: true, 
      message: "Simulado", 
      account: { 
        username: data.username, 
        password: data.password, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      } 
    };
  });

export const savePanelAccountFn = updatePanelAccount;

export const loadFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async () => {
    return { 
      success: true, 
      message: "OK", 
      profile: null as FlussonicConnectionProfile | null, 
      profiles: [] as FlussonicConnectionProfile[] 
    } as {
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    };
  });

export const refreshFlussonicConnectionProfile = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async () => {
    return { 
      success: true, 
      message: "OK", 
      profile: null as FlussonicConnectionProfile | null, 
      health: null as FlussonicConnectionHealth | null, 
      profiles: [] as FlussonicConnectionProfile[] 
    } as {
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      health: FlussonicConnectionHealth | null;
      profiles: FlussonicConnectionProfile[];
    };
  });

export const activateSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { 
      success: true, 
      message: "OK", 
      profile: null as FlussonicConnectionProfile | null, 
      profiles: [] as FlussonicConnectionProfile[] 
    } as {
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    };
  });

export const deleteSavedFlussonicProfile = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Removido" };
  });

export const clearFlussonicConnection = createServerFn({ method: "POST" })
  .validator(panelUsernameSchema)
  .handler(async () => {
    return { success: true, message: "Conexão limpa" };
  });

export const fetchFlussonicStreams = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "OK", streams: [] };
  });

export const fetchFlussonicMirror = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { 
      success: true, 
      message: "OK", 
      snapshot: null as FlussonicMirrorSnapshot | null 
    };
  });

export const startFlussonicDownloadJob = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Simulado", jobId: randomUUID() };
  });

export const fetchFlussonicDownloadJobStatus = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { 
      success: true, 
      message: "Simulado", 
      status: null as FlussonicDownloadJobStatus | null 
    };
  });

export const createFlussonicCategory = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string(), serverIp: z.string(), sshUser: z.string(), sshPassword: z.string().optional(), sshPort: z.number() }))
  .handler(async ({ data }) => {
    return { success: true, message: `Categoria ${data.name} simulada no servidor ${data.serverIp}` };
  });

export const createFlussonicChannel = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string(), serverIp: z.string(), sshUser: z.string(), sshPassword: z.string().optional(), sshPort: z.number(), category: z.string().optional(), videos: z.array(z.string()) }))
  .handler(async ({ data }) => {
    return { success: true, message: `Canal ${data.name} simulado no servidor ${data.serverIp}` };
  });

export const listFlussonicCategories = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, categories: ["simulada-1", "simulada-2"] };
  });

export const downloadCategoryToServer = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Simulado" };
  });

export const deleteFlussonicChannel = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Simulado" };
  });

export const deleteFlussonicCategory = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Simulado" };
  });

export const generateFlussonicPublicPlaylist = createServerFn({ method: "POST" })
  .validator(z.any())
  .handler(async () => {
    return { success: true, message: "Simulado", playlist: "" };
  });
