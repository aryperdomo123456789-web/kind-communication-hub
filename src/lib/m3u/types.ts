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

export interface M3USeriesCategory {
  name: string;
  series: {
    name: string;
    seasons: {
      number: string;
      episodes: M3UItem[];
    }[];
  }[];
}

export interface FlussonicStreamInfo {
  name: string;
  playlistPath?: string;
}

export interface FlussonicChannelInfo {
  name: string;
  streamName: string;
  playlistPath?: string;
  folderPath?: string;
  mediaFiles: string[];
  mediaCount: number;
}

export interface FlussonicCategoryInfo {
  name: string;
  path: string;
  channels: FlussonicChannelInfo[];
  fileCount: number;
  streamCount: number;
}

export interface FlussonicMirrorSnapshot {
  storageRoot: string;
  confPath: string;
  vodConfigured: boolean;
  streams: FlussonicStreamInfo[];
  categories: FlussonicCategoryInfo[];
  orphanStreams: FlussonicStreamInfo[];
}

export interface PanelAccount {
  username: string;
  password: string;
}

export interface FlussonicConnectionHealth {
  state: "connected" | "degraded" | "disconnected";
  lastCheckedAt: string;
  sshOk: boolean;
  apiOk: boolean;
  message: string;
}

export interface FlussonicConnectionProfile {
  panelUsername: string;
  serverIp: string;
  sshUser: string;
  sshPort: number;
  sshPassword: string;
  apiBaseUrl: string;
  apiUsername: string;
  apiPassword: string;
  apiStreamsPath: string;
  createdAt: string;
  updatedAt: string;
  lastHealth?: FlussonicConnectionHealth;
  profileId?: string;
  profileName?: string;
  isActive?: boolean;
}

export interface FlussonicDownloadItemStatus {
  name: string;
  fileName: string;
  url: string;
  status: "queued" | "downloading" | "done" | "error";
  downloadedBytes: number;
  totalBytes: number | null;
  error?: string;
}

export interface FlussonicDownloadJobStatus {
  jobId: string;
  state: "queued" | "running" | "completed" | "failed";
  categoryName: string;
  channelName?: string;
  streamName: string;
  folder: string;
  playlistPath: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  currentFile?: string;
  percent: number;
  items: FlussonicDownloadItemStatus[];
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  message?: string;
  error?: string;
}

export interface M3UParsed {
  movies: M3UCategory[];
  series: M3USeriesCategory[];
  live: M3UCategory[];
}
