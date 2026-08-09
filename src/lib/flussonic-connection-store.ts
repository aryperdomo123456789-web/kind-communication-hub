import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sqlite3 from "@libsql/sqlite3";
import { promisify } from "node:util";
import type {
  FlussonicDownloadItemStatus,
  FlussonicDownloadJobStatus,
  M3UItem,
} from "@/lib/m3u/types";

export type FlussonicConnectionHealthState = "connected" | "degraded" | "disconnected";

export interface FlussonicConnectionHealth {
  state: FlussonicConnectionHealthState;
  lastCheckedAt: string;
  sshOk: boolean;
  apiOk: boolean;
  message: string;
}

export interface SavedFlussonicConnectionProfile {
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

export interface PanelUserRecord {
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
  activeFlussonicProfileId?: string | null;
}

export type SavedCustomCategories = Record<string, M3UItem[]>;

export interface SavedM3UListRecord {
  listId: string;
  panelUsername: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt?: string;
}

export type DownloadJobEventLevel = "info" | "success" | "warning" | "error";

export interface DownloadJobEventRecord {
  eventId: string;
  jobId: string;
  panelUsername: string;
  eventType: string;
  level: DownloadJobEventLevel;
  message: string;
  details?: unknown;
  createdAt: string;
}

export interface PersistedDownloadJobRecord extends FlussonicDownloadJobStatus {
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
  concurrency: number;
  sourceItems: { name: string; url: string }[];
  items: FlussonicDownloadItemStatus[];
}

const DEFAULT_PANEL_ACCOUNT = {
  username: "mago@dono.com",
  password: "12345678",
};

const RUNTIME_DIR = path.join(process.cwd(), ".runtime");
const SQLITE_PATH = path.join(RUNTIME_DIR, "panel.sqlite");

mkdirSync(RUNTIME_DIR, { recursive: true });

const db = new sqlite3.Database(pathToFileURL(SQLITE_PATH).href);
const dbRun = (sql: string, params: any[] = []) => new Promise<void>((resolve, reject) => {
  db.run(sql, params, (err) => err ? reject(err) : resolve());
});
const dbGet = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

async function initDb() {
  await dbRun("PRAGMA journal_mode = WAL");
  await dbRun("PRAGMA foreign_keys = ON");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      active_flussonic_profile_id TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS flussonic_profiles (
      profile_id TEXT PRIMARY KEY,
      panel_username TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      server_ip TEXT NOT NULL,
      ssh_user TEXT NOT NULL,
      ssh_port INTEGER NOT NULL,
      ssh_password TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      api_username TEXT NOT NULL,
      api_password TEXT NOT NULL,
      api_streams_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_health_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (panel_username) REFERENCES users(username) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS custom_categories (
      panel_username TEXT PRIMARY KEY,
      categories_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (panel_username) REFERENCES users(username) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS m3u_lists (
      list_id TEXT PRIMARY KEY,
      panel_username TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activated_at TEXT,
      UNIQUE(panel_username, url),
      FOREIGN KEY (panel_username) REFERENCES users(username) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS download_jobs (
      job_id TEXT PRIMARY KEY,
      panel_username TEXT NOT NULL,
      state TEXT NOT NULL,
      server_ip TEXT NOT NULL,
      category_name TEXT NOT NULL,
      channel_name TEXT,
      stream_name TEXT NOT NULL,
      folder TEXT NOT NULL,
      playlist_path TEXT NOT NULL,
      total_items INTEGER NOT NULL,
      completed_items INTEGER NOT NULL,
      failed_items INTEGER NOT NULL,
      current_file TEXT,
      percent INTEGER NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      message TEXT,
      error TEXT,
      job_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (panel_username) REFERENCES users(username) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS download_job_events (
      event_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      panel_username TEXT NOT NULL,
      event_type TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES download_jobs(job_id) ON DELETE CASCADE,
      FOREIGN KEY (panel_username) REFERENCES users(username) ON DELETE CASCADE
    )
  `);

  const existing = await dbGet("SELECT username FROM users WHERE username = ?", [DEFAULT_PANEL_ACCOUNT.username]);
  if (!existing) {
    const now = new Date().toISOString();
    await dbRun(
      "INSERT INTO users (username, password, created_at, updated_at, active_flussonic_profile_id) VALUES (?, ?, ?, ?, ?)",
      [DEFAULT_PANEL_ACCOUNT.username, DEFAULT_PANEL_ACCOUNT.password, now, now, null]
    );
  }
}

initDb().catch(console.error);

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePanelUsername(value: string) {
  return value.trim() || "mago@dono.com";
}

function hydrateM3UList(row: any): SavedM3UListRecord {
  return {
    listId: row.list_id,
    panelUsername: row.panel_username,
    name: row.name,
    url: row.url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivatedAt: row.last_activated_at || undefined,
  };
}

function normalizeDownloadJobRecord(job: PersistedDownloadJobRecord): PersistedDownloadJobRecord {
  return {
    ...job,
    panelUsername: normalizePanelUsername(job.panelUsername),
    items: Array.isArray(job.items) ? job.items : [],
    sourceItems: Array.isArray(job.sourceItems) ? job.sourceItems : [],
  };
}

function hydratePersistedDownloadJob(row: any): PersistedDownloadJobRecord | null {
  if (!row) return null;
  const job = safeJsonParse<PersistedDownloadJobRecord>(row.job_json, null as any);
  if (!job) return null;
  return normalizeDownloadJobRecord({
    ...job,
    jobId: row.job_id,
    panelUsername: row.panel_username,
    state: row.state,
    serverIp: row.server_ip,
    categoryName: row.category_name,
    channelName: row.channel_name || undefined,
    streamName: row.stream_name,
    folder: row.folder,
    playlistPath: row.playlist_path,
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    currentFile: row.current_file || undefined,
    percent: row.percent,
    startedAt: row.started_at || undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at || undefined,
    message: row.message || undefined,
    error: row.error || undefined,
    sshUser: job.sshUser,
    sshPassword: job.sshPassword,
    sshPort: job.sshPort,
    apiBaseUrl: job.apiBaseUrl,
    apiUsername: job.apiUsername,
    apiPassword: job.apiPassword,
    apiStreamsPath: job.apiStreamsPath,
    mediaRoot: job.mediaRoot,
    flussonicConfPath: job.flussonicConfPath,
    reloadFlussonic: Boolean(job.reloadFlussonic),
    concurrency: job.concurrency,
    sourceItems: job.sourceItems || [],
    items: job.items || [],
  });
}

export async function saveDownloadJobSnapshot(job: PersistedDownloadJobRecord): Promise<PersistedDownloadJobRecord> {
  const normalized = normalizeDownloadJobRecord(job);
  const now = new Date().toISOString();
  await dbRun(
    `
      INSERT INTO download_jobs (
        job_id, panel_username, state, server_ip, category_name, channel_name, stream_name, folder,
        playlist_path, total_items, completed_items, failed_items, current_file, percent, started_at,
        updated_at, finished_at, message, error, job_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        panel_username = excluded.panel_username,
        state = excluded.state,
        server_ip = excluded.server_ip,
        category_name = excluded.category_name,
        channel_name = excluded.channel_name,
        stream_name = excluded.stream_name,
        folder = excluded.folder,
        playlist_path = excluded.playlist_path,
        total_items = excluded.total_items,
        completed_items = excluded.completed_items,
        failed_items = excluded.failed_items,
        current_file = excluded.current_file,
        percent = excluded.percent,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        finished_at = excluded.finished_at,
        message = excluded.message,
        error = excluded.error,
        job_json = excluded.job_json
    `,
    [
      normalized.jobId,
      normalized.panelUsername,
      normalized.state,
      normalized.serverIp,
      normalized.categoryName,
      normalized.channelName || null,
      normalized.streamName,
      normalized.folder,
      normalized.playlistPath,
      normalized.totalItems,
      normalized.completedItems,
      normalized.failedItems,
      normalized.currentFile || null,
      normalized.percent,
      normalized.startedAt || null,
      normalized.updatedAt || now,
      normalized.finishedAt || null,
      normalized.message || null,
      normalized.error || null,
      JSON.stringify(normalized),
      normalized.startedAt || now,
    ],
  );

  return normalized;
}

export async function getDownloadJobSnapshot(jobId: string): Promise<PersistedDownloadJobRecord | null> {
  const row = (await dbGet("SELECT * FROM download_jobs WHERE job_id = ?", [jobId])) as any;
  return hydratePersistedDownloadJob(row);
}

export async function getLatestActiveDownloadJob(panelUsername: string): Promise<PersistedDownloadJobRecord | null> {
  const row = (await dbGet(
    `
      SELECT * FROM download_jobs
      WHERE panel_username = ? AND state IN ('queued', 'running')
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [normalizePanelUsername(panelUsername)],
  )) as any;
  return hydratePersistedDownloadJob(row);
}

export async function listRecentDownloadJobs(
  panelUsername: string,
  limit = 10,
): Promise<PersistedDownloadJobRecord[]> {
  const rows = (await dbAll(
    `
      SELECT * FROM download_jobs
      WHERE panel_username = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    [normalizePanelUsername(panelUsername), Math.max(1, limit)],
  )) as any[];
  return rows.map((row) => hydratePersistedDownloadJob(row)).filter(Boolean) as PersistedDownloadJobRecord[];
}

export async function appendDownloadJobEvent(input: {
  jobId: string;
  panelUsername: string;
  eventType: string;
  level: DownloadJobEventLevel;
  message: string;
  details?: unknown;
}): Promise<DownloadJobEventRecord> {
  const createdAt = new Date().toISOString();
  const event: DownloadJobEventRecord = {
    eventId: randomUUID(),
    jobId: input.jobId,
    panelUsername: normalizePanelUsername(input.panelUsername),
    eventType: input.eventType,
    level: input.level,
    message: input.message,
    details: input.details,
    createdAt,
  };

  await dbRun(
    `
      INSERT INTO download_job_events (
        event_id, job_id, panel_username, event_type, level, message, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      event.eventId,
      event.jobId,
      event.panelUsername,
      event.eventType,
      event.level,
      event.message,
      event.details !== undefined ? JSON.stringify(event.details) : null,
      event.createdAt,
    ],
  );

  return event;
}

export async function listDownloadJobEvents(jobId: string): Promise<DownloadJobEventRecord[]> {
  const rows = (await dbAll(
    `
      SELECT * FROM download_job_events
      WHERE job_id = ?
      ORDER BY created_at ASC
    `,
    [jobId],
  )) as any[];

  return rows.map((row) => ({
    eventId: row.event_id,
    jobId: row.job_id,
    panelUsername: row.panel_username,
    eventType: row.event_type,
    level: row.level,
    message: row.message,
    details: safeJsonParse(row.details_json, null),
    createdAt: row.created_at,
  }));
}

export async function getSavedPanelAccount(username: string = DEFAULT_PANEL_ACCOUNT.username): Promise<PanelUserRecord | null> {
  const row = await dbGet("SELECT * FROM users WHERE username = ?", [username.trim()]) as any;
  if (!row) return null;
  return {
    username: row.username,
    password: row.password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeFlussonicProfileId: row.active_flussonic_profile_id,
  };
}

export async function savePanelAccount(username: string, password: string) {
  const now = new Date().toISOString();
  await dbRun(
    "INSERT INTO users (username, password, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET password=excluded.password, updated_at=excluded.updated_at",
    [username.trim(), password, now, now]
  );
  return getSavedPanelAccount(username);
}

export async function listSavedFlussonicConnectionProfiles(panelUsername: string): Promise<SavedFlussonicConnectionProfile[]> {
  const rows = await dbAll("SELECT * FROM flussonic_profiles WHERE panel_username = ? ORDER BY updated_at DESC", [panelUsername.trim()]) as any[];
  return rows.map(row => ({
    profileId: row.profile_id,
    panelUsername: row.panel_username,
    profileName: row.profile_name,
    serverIp: row.server_ip,
    sshUser: row.ssh_user,
    sshPort: row.ssh_port,
    sshPassword: row.ssh_password,
    apiBaseUrl: row.api_base_url,
    apiUsername: row.api_username,
    apiPassword: row.api_password,
    apiStreamsPath: row.api_streams_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHealth: row.last_health_json ? JSON.parse(row.last_health_json) : undefined,
    isActive: row.is_active === 1,
  }));
}

export async function getSavedFlussonicConnectionProfile(panelUsername: string, profileId?: string): Promise<SavedFlussonicConnectionProfile | null> {
  const query = profileId 
    ? "SELECT * FROM flussonic_profiles WHERE panel_username = ? AND profile_id = ?" 
    : "SELECT * FROM flussonic_profiles WHERE panel_username = ? AND is_active = 1 LIMIT 1";
  const params = profileId ? [panelUsername.trim(), profileId] : [panelUsername.trim()];
  const row = await dbGet(query, params) as any;
  if (!row) return null;
  return {
    profileId: row.profile_id,
    panelUsername: row.panel_username,
    profileName: row.profile_name,
    serverIp: row.server_ip,
    sshUser: row.ssh_user,
    sshPort: row.ssh_port,
    sshPassword: row.ssh_password,
    apiBaseUrl: row.api_base_url,
    apiUsername: row.api_username,
    apiPassword: row.api_password,
    apiStreamsPath: row.api_streams_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHealth: row.last_health_json ? JSON.parse(row.last_health_json) : undefined,
    isActive: row.is_active === 1,
  };
}

export async function saveFlussonicConnectionProfile(profile: SavedFlussonicConnectionProfile) {
  const id = profile.profileId || randomUUID();
  const now = new Date().toISOString();
  
  if (profile.isActive) {
    await dbRun("UPDATE flussonic_profiles SET is_active = 0 WHERE panel_username = ?", [profile.panelUsername.trim()]);
  }

  await dbRun(`
    INSERT INTO flussonic_profiles (
      profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port, ssh_password,
      api_base_url, api_username, api_password, api_streams_path, created_at, updated_at, last_health_json, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      profile_name=excluded.profile_name, server_ip=excluded.server_ip, ssh_user=excluded.ssh_user,
      ssh_port=excluded.ssh_port, ssh_password=excluded.ssh_password, api_base_url=excluded.api_base_url,
      api_username=excluded.api_username, api_password=excluded.api_password, api_streams_path=excluded.api_streams_path,
      updated_at=excluded.updated_at, last_health_json=excluded.last_health_json, is_active=excluded.is_active
  `,
    [
      id, profile.panelUsername.trim(), profile.profileName || profile.serverIp, profile.serverIp, profile.sshUser,
      profile.sshPort, profile.sshPassword, profile.apiBaseUrl, profile.apiUsername, profile.apiPassword,
      profile.apiStreamsPath, profile.createdAt || now, now, profile.lastHealth ? JSON.stringify(profile.lastHealth) : null, profile.isActive ? 1 : 0
    ]
  );

  return getSavedFlussonicConnectionProfile(profile.panelUsername, id);
}

export async function clearFlussonicConnectionProfile(panelUsername: string) {
  await dbRun("UPDATE flussonic_profiles SET is_active = 0 WHERE panel_username = ?", [panelUsername.trim()]);
}

export async function deleteFlussonicConnectionProfile(panelUsername: string, profileId: string) {
  await dbRun("DELETE FROM flussonic_profiles WHERE panel_username = ? AND profile_id = ?", [panelUsername.trim(), profileId]);
  return true;
}

export async function setActiveFlussonicConnectionProfile(panelUsername: string, profileId: string) {
  await dbRun("UPDATE flussonic_profiles SET is_active = 0 WHERE panel_username = ?", [panelUsername.trim()]);
  await dbRun("UPDATE flussonic_profiles SET is_active = 1 WHERE panel_username = ? AND profile_id = ?", [panelUsername.trim(), profileId]);
  return getSavedFlussonicConnectionProfile(panelUsername, profileId);
}

export async function getSavedCustomCategories(panelUsername: string): Promise<SavedCustomCategories> {
  const row = await dbGet("SELECT categories_json FROM custom_categories WHERE panel_username = ?", [panelUsername.trim()]) as any;
  if (!row?.categories_json) return {};

  try {
    const parsed = JSON.parse(row.categories_json) as SavedCustomCategories;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveCustomCategories(panelUsername: string, categories: SavedCustomCategories) {
  const now = new Date().toISOString();
  await dbRun(
    `
      INSERT INTO custom_categories (panel_username, categories_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(panel_username) DO UPDATE SET
        categories_json = excluded.categories_json,
        updated_at = excluded.updated_at
    `,
    [panelUsername.trim(), JSON.stringify(categories || {}), now, now],
  );

  return getSavedCustomCategories(panelUsername);
}

export async function deleteSavedCustomCategory(panelUsername: string, categoryName: string) {
  const current = await getSavedCustomCategories(panelUsername);
  if (!current[categoryName]) return current;

  const next = { ...current };
  delete next[categoryName];
  await saveCustomCategories(panelUsername, next);
  return next;
}

export async function listSavedM3ULists(panelUsername: string): Promise<SavedM3UListRecord[]> {
  const rows = (await dbAll(
    `
      SELECT * FROM m3u_lists
      WHERE panel_username = ?
      ORDER BY is_active DESC, updated_at DESC
    `,
    [normalizePanelUsername(panelUsername)],
  )) as any[];

  return rows.map(hydrateM3UList);
}

export async function getActiveM3UList(panelUsername: string): Promise<SavedM3UListRecord | null> {
  const row = (await dbGet(
    `
      SELECT * FROM m3u_lists
      WHERE panel_username = ? AND is_active = 1
      LIMIT 1
    `,
    [normalizePanelUsername(panelUsername)],
  )) as any;

  return row ? hydrateM3UList(row) : null;
}

export async function saveM3UList(panelUsername: string, name: string, url: string): Promise<SavedM3UListRecord[]> {
  const now = new Date().toISOString();
  const normalizedPanelUsername = normalizePanelUsername(panelUsername);
  const normalizedName = name.trim();
  const normalizedUrl = url.trim();
  const active = await getActiveM3UList(normalizedPanelUsername);

  await dbRun(
    `
      INSERT INTO m3u_lists (
        list_id, panel_username, name, url, is_active, created_at, updated_at, last_activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(panel_username, url) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `,
    [
      randomUUID(),
      normalizedPanelUsername,
      normalizedName,
      normalizedUrl,
      active?.url === normalizedUrl ? 1 : 0,
      now,
      now,
      active?.url === normalizedUrl ? now : null,
    ],
  );

  return listSavedM3ULists(normalizedPanelUsername);
}

export async function activateM3UList(panelUsername: string, url: string): Promise<SavedM3UListRecord | null> {
  const normalizedPanelUsername = normalizePanelUsername(panelUsername);
  const normalizedUrl = url.trim();
  const now = new Date().toISOString();

  await dbRun("UPDATE m3u_lists SET is_active = 0 WHERE panel_username = ?", [normalizedPanelUsername]);
  await dbRun(
    "UPDATE m3u_lists SET is_active = 1, last_activated_at = ?, updated_at = ? WHERE panel_username = ? AND url = ?",
    [now, now, normalizedPanelUsername, normalizedUrl],
  );

  return getActiveM3UList(normalizedPanelUsername);
}

export async function deactivateM3UList(panelUsername: string): Promise<void> {
  await dbRun("UPDATE m3u_lists SET is_active = 0 WHERE panel_username = ?", [normalizePanelUsername(panelUsername)]);
}

export async function deleteSavedM3UList(panelUsername: string, url: string): Promise<SavedM3UListRecord[]> {
  const normalizedPanelUsername = normalizePanelUsername(panelUsername);
  const normalizedUrl = url.trim();
  await dbRun("DELETE FROM m3u_lists WHERE panel_username = ? AND url = ?", [normalizedPanelUsername, normalizedUrl]);
  return listSavedM3ULists(normalizedPanelUsername);
}
