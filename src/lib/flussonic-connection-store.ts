import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { promisify } from "node:util";

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

const DEFAULT_PANEL_ACCOUNT = {
  username: "mago@dono.com",
  password: "12345678",
};

const RUNTIME_DIR = path.join(process.cwd(), ".runtime");
const SQLITE_PATH = path.join(RUNTIME_DIR, "panel.sqlite");

mkdirSync(RUNTIME_DIR, { recursive: true });

const db = new sqlite3.Database(SQLITE_PATH);
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
  const row = await dbGet(query, ...params) as any;
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
