import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Database } from "@libsql/sqlite3";
 ;;

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

interface LegacyDbShape {
  version?: number;
  users?: Record<string, PanelUserRecord>;
  flussonicProfiles?: Record<string, SavedFlussonicConnectionProfile[]>;
}

const DEFAULT_PANEL_ACCOUNT = {
  username: "mago@dono.com",
  password: "12345678",
};

const RUNTIME_DIR = path.join(process.cwd(), ".runtime");
const SQLITE_PATH = path.join(RUNTIME_DIR, "panel.sqlite");
const LEGACY_JSON_PATHS = [
  path.join(RUNTIME_DIR, "panel-db.json"),
  path.join(RUNTIME_DIR, "flussonic-connection-profiles.json"),
];

mkdirSync(RUNTIME_DIR, { recursive: true });

const db = new Database(SQLITE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    active_flussonic_profile_id TEXT
  );

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
  );

  CREATE INDEX IF NOT EXISTS idx_flussonic_profiles_panel_username
    ON flussonic_profiles(panel_username);
`);

function nowIso() {
  return new Date().toISOString();
}

function defaultPanelUser(): PanelUserRecord {
  const timestamp = nowIso();
  return {
    username: DEFAULT_PANEL_ACCOUNT.username,
    password: DEFAULT_PANEL_ACCOUNT.password,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeFlussonicProfileId: null,
  };
}

function ensureDefaultUser() {
  const existing = db
    .prepare("SELECT username FROM users WHERE username = ?")
    .get(DEFAULT_PANEL_ACCOUNT.username) as any;

  if (!existing) {
    const user = defaultPanelUser();
    db.prepare(
      `INSERT INTO users (username, password, created_at, updated_at, active_flussonic_profile_id)
       VALUES (@username, @password, @createdAt, @updatedAt, @activeFlussonicProfileId)`,
    ).run(user);
  }
}

ensureDefaultUser();

function normalizePanelUsername(panelUsername: string) {
  return panelUsername.trim();
}

function normalizeProfileName(profile: SavedFlussonicConnectionProfile, profileId: string) {
  return profile.profileName?.trim() || profile.serverIp || `Servidor ${profileId.slice(0, 6)}`;
}

function toProfileRow(profile: SavedFlussonicConnectionProfile) {
  const profileId = profile.profileId?.trim() || randomUUID();
  const createdAt = profile.createdAt || nowIso();
  const updatedAt = nowIso();

  return {
    profileId,
    panelUsername: normalizePanelUsername(profile.panelUsername),
    profileName: normalizeProfileName(profile, profileId),
    serverIp: profile.serverIp,
    sshUser: profile.sshUser,
    sshPort: profile.sshPort,
    sshPassword: profile.sshPassword,
    apiBaseUrl: profile.apiBaseUrl,
    apiUsername: profile.apiUsername,
    apiPassword: profile.apiPassword,
    apiStreamsPath: profile.apiStreamsPath,
    createdAt,
    updatedAt,
    lastHealthJson: profile.lastHealth ? JSON.stringify(profile.lastHealth) : null,
    isActive: profile.isActive ? 1 : 0,
  };
}

function rowToProfile(row: {
  profile_id: string;
  panel_username: string;
  profile_name: string;
  server_ip: string;
  ssh_user: string;
  ssh_port: number;
  ssh_password: string;
  api_base_url: string;
  api_username: string;
  api_password: string;
  api_streams_path: string;
  created_at: string;
  updated_at: string;
  last_health_json: string | null;
  is_active: number;
}): SavedFlussonicConnectionProfile {
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
    lastHealth: row.last_health_json
      ? (JSON.parse(row.last_health_json) as FlussonicConnectionHealth)
      : undefined,
    isActive: row.is_active === 1,
  } as any;
}

function rowToUser(row: {
  username: string;
  password: string;
  created_at: string;
  updated_at: string;
  active_flussonic_profile_id: string | null;
}): PanelUserRecord {
  return {
    username: row.username,
    password: row.password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeFlussonicProfileId: row.active_flussonic_profile_id,
  };
}

function loadLegacyDatabaseShape(): LegacyDbShape | null {
  for (const legacyPath of LEGACY_JSON_PATHS) {
    if (!existsSync(legacyPath)) continue;

    try {
      const raw = readFileSync(legacyPath, "utf8");
      const parsed = JSON.parse(raw) as LegacyDbShape;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Se o JSON legado estiver quebrado, seguimos com um banco vazio.
    }
  }

  return null;
}

function importLegacyDataIfNeeded() {
  const hasProfiles = db.prepare("SELECT COUNT(1) AS count FROM flussonic_profiles").get() as {
    count: number;
  };

  if (hasProfiles.count > 0) {
    return;
  }

  const legacy = loadLegacyDatabaseShape();
  if (!legacy) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (username, password, created_at, updated_at, active_flussonic_profile_id)
    VALUES (@username, @password, @createdAt, @updatedAt, @activeFlussonicProfileId)
    ON CONFLICT(username) DO UPDATE SET
      password = excluded.password,
      updated_at = excluded.updated_at,
      active_flussonic_profile_id = excluded.active_flussonic_profile_id
  `);

  const transaction = db.transaction(() => {
    if (legacy.users) {
      for (const user of Object.values(legacy.users)) {
        insertUser.run({
          username: normalizePanelUsername(user.username),
          password: user.password,
          createdAt: user.createdAt || nowIso(),
          updatedAt: user.updatedAt || nowIso(),
          activeFlussonicProfileId: user.activeFlussonicProfileId ?? null,
        });
      }
    }

    const profiles = legacy.flussonicProfiles ?? {};
    for (const [panelUsername, entries] of Object.entries(profiles)) {
      for (const profile of entries) {
        const normalized = toProfileRow({
          ...profile,
          panelUsername,
          profileId: profile.profileId || randomUUID(),
        });

        db.prepare(
          `INSERT INTO flussonic_profiles (
            profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port, ssh_password,
            api_base_url, api_username, api_password, api_streams_path, created_at, updated_at,
            last_health_json, is_active
          ) VALUES (
            @profileId, @panelUsername, @profileName, @serverIp, @sshUser, @sshPort, @sshPassword,
            @apiBaseUrl, @apiUsername, @apiPassword, @apiStreamsPath, @createdAt, @updatedAt,
            @lastHealthJson, @isActive
          )
          ON CONFLICT(profile_id) DO UPDATE SET
            panel_username = excluded.panel_username,
            profile_name = excluded.profile_name,
            server_ip = excluded.server_ip,
            ssh_user = excluded.ssh_user,
            ssh_port = excluded.ssh_port,
            ssh_password = excluded.ssh_password,
            api_base_url = excluded.api_base_url,
            api_username = excluded.api_username,
            api_password = excluded.api_password,
            api_streams_path = excluded.api_streams_path,
            updated_at = excluded.updated_at,
            last_health_json = excluded.last_health_json,
            is_active = excluded.is_active`,
        ).run(normalized);

        if (normalized.isActive) {
          db.prepare(
            `UPDATE users
             SET active_flussonic_profile_id = ?, updated_at = ?
             WHERE username = ?`,
          ).run(normalized.profileId, normalized.updatedAt, normalized.panelUsername);
        }
      }
    }
  });

  try {
    transaction();
  } catch {
    // Se a importação falhar por conflito parcial, mantemos o banco vazio e seguimos.
  }
}

importLegacyDataIfNeeded();

export async function getSavedPanelAccount(username: string = DEFAULT_PANEL_ACCOUNT.username) {
  const row = db
    .prepare(
      `SELECT username, password, created_at, updated_at, active_flussonic_profile_id
       FROM users WHERE username = ?`,
    )
    .get(normalizePanelUsername(username)) as
    | {
        username: string;
        password: string;
        created_at: string;
        updated_at: string;
        active_flussonic_profile_id: string | null;
      }
    | undefined;

  return row ? rowToUser(row) : null;
}

export async function savePanelAccount(account: { username: string; password: string }) {
  const normalizedUsername = normalizePanelUsername(account.username);
  const current = await getSavedPanelAccount(normalizedUsername);
  const createdAt = current?.createdAt || nowIso();
  const updatedAt = nowIso();

  db.prepare(
    `
    INSERT INTO users (username, password, created_at, updated_at, active_flussonic_profile_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password = excluded.password,
      created_at = users.created_at,
      updated_at = excluded.updated_at,
      active_flussonic_profile_id = users.active_flussonic_profile_id
  `,
  ).run(
    normalizedUsername,
    account.password,
    createdAt,
    updatedAt,
    current?.activeFlussonicProfileId ?? null,
  );

  return (
    (await getSavedPanelAccount(normalizedUsername)) ?? {
      username: normalizedUsername,
      password: account.password,
      createdAt,
      updatedAt,
      activeFlussonicProfileId: current?.activeFlussonicProfileId ?? null,
    }
  );
}

export async function listSavedFlussonicConnectionProfiles(panelUsername: string) {
  const rows = db
    .prepare(
      `SELECT profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port,
              ssh_password, api_base_url, api_username, api_password, api_streams_path,
              created_at, updated_at, last_health_json, is_active
       FROM flussonic_profiles
       WHERE panel_username = ?
       ORDER BY updated_at DESC`,
    )
    .all(normalizePanelUsername(panelUsername)) as any[];

  return rows.map(rowToProfile);
}

export async function getSavedFlussonicConnectionProfile(
  panelUsername: string,
  profileId?: string,
): Promise<SavedFlussonicConnectionProfile | null> {
  const normalizedUsername = normalizePanelUsername(panelUsername);

  if (profileId) {
    const row = db
      .prepare(
        `SELECT profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port,
                ssh_password, api_base_url, api_username, api_password, api_streams_path,
                created_at, updated_at, last_health_json, is_active
         FROM flussonic_profiles
         WHERE panel_username = ? AND profile_id = ?`,
      )
      .get(normalizedUsername, profileId) as any;
    return row ? rowToProfile(row) : null;
  }

  const user = await getSavedPanelAccount(normalizedUsername);
  const activeId = user?.activeFlussonicProfileId ?? null;
  if (activeId) {
    const activeProfile = await getSavedFlussonicConnectionProfile(normalizedUsername, activeId);
    if (activeProfile) return activeProfile;
  }

  const first = db
    .prepare(
      `SELECT profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port,
              ssh_password, api_base_url, api_username, api_password, api_streams_path,
              created_at, updated_at, last_health_json, is_active
       FROM flussonic_profiles
       WHERE panel_username = ?
       ORDER BY is_active DESC, updated_at DESC, created_at DESC
       LIMIT 1`,
    )
    .get(normalizedUsername) as any;

  return first ? rowToProfile(first) : null;
}

export async function saveFlussonicConnectionProfile(profile: SavedFlussonicConnectionProfile) {
  const normalizedUsername = normalizePanelUsername(profile.panelUsername);
  const profileId = profile.profileId?.trim() || randomUUID();
  const existing = db
    .prepare(
      `SELECT profile_id, created_at, panel_username
       FROM flussonic_profiles WHERE profile_id = ? AND panel_username = ?`,
    )
    .get(profileId, normalizedUsername) as any | undefined;

  const createdAt = existing?.created_at || profile.createdAt || nowIso();
  const updatedAt = nowIso();
  const normalizedProfileName = normalizeProfileName(profile, profileId);
  const row = {
    profileId,
    panelUsername: normalizedUsername,
    profileName: normalizedProfileName,
    serverIp: profile.serverIp,
    sshUser: profile.sshUser,
    sshPort: profile.sshPort,
    sshPassword: profile.sshPassword,
    apiBaseUrl: profile.apiBaseUrl,
    apiUsername: profile.apiUsername,
    apiPassword: profile.apiPassword,
    apiStreamsPath: profile.apiStreamsPath,
    createdAt,
    updatedAt,
    lastHealthJson: profile.lastHealth ? JSON.stringify(profile.lastHealth) : null,
    isActive: 1,
  };
  const nextAccountPassword =
    normalizedUsername === DEFAULT_PANEL_ACCOUNT.username
      ? DEFAULT_PANEL_ACCOUNT.password
      : (awaitMaybeAccountPassword(normalizedUsername) ?? "");

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (username, password, created_at, updated_at, active_flussonic_profile_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET updated_at = excluded.updated_at`,
    ).run(normalizedUsername, nextAccountPassword, createdAt, updatedAt, profileId);

    db.prepare(
      `UPDATE flussonic_profiles
       SET is_active = 0
       WHERE panel_username = ?`,
    ).run(normalizedUsername);

    db.prepare(
      `INSERT INTO flussonic_profiles (
        profile_id, panel_username, profile_name, server_ip, ssh_user, ssh_port, ssh_password,
        api_base_url, api_username, api_password, api_streams_path, created_at, updated_at,
        last_health_json, is_active
      ) VALUES (
        @profileId, @panelUsername, @profileName, @serverIp, @sshUser, @sshPort, @sshPassword,
        @apiBaseUrl, @apiUsername, @apiPassword, @apiStreamsPath, @createdAt, @updatedAt,
        @lastHealthJson, @isActive
      )
      ON CONFLICT(profile_id) DO UPDATE SET
        profile_name = excluded.profile_name,
        server_ip = excluded.server_ip,
        ssh_user = excluded.ssh_user,
        ssh_port = excluded.ssh_port,
        ssh_password = excluded.ssh_password,
        api_base_url = excluded.api_base_url,
        api_username = excluded.api_username,
        api_password = excluded.api_password,
        api_streams_path = excluded.api_streams_path,
        updated_at = excluded.updated_at,
        last_health_json = excluded.last_health_json,
        is_active = excluded.is_active`,
    ).run(row);

    db.prepare(
      `UPDATE users
       SET active_flussonic_profile_id = ?, updated_at = ?
       WHERE username = ?`,
    ).run(profileId, updatedAt, normalizedUsername);
  });

  transaction();

  return (await getSavedFlussonicConnectionProfile(normalizedUsername, profileId)) ?? null;
}

function awaitMaybeAccountPassword(username: string) {
  const row = db.prepare(`SELECT password FROM users WHERE username = ?`).get(username) as
    { password?: string } | undefined;
  return row?.password;
}

export async function setActiveFlussonicConnectionProfile(
  panelUsername: string,
  profileId: string,
) {
  const normalizedUsername = normalizePanelUsername(panelUsername);
  const profile = await getSavedFlussonicConnectionProfile(normalizedUsername, profileId);
  if (!profile) return null;

  const updatedAt = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE flussonic_profiles SET is_active = CASE WHEN profile_id = ? THEN 1 ELSE 0 END
       WHERE panel_username = ?`,
    ).run(profileId, normalizedUsername);
    db.prepare(
      `UPDATE users SET active_flussonic_profile_id = ?, updated_at = ?
       WHERE username = ?`,
    ).run(profileId, updatedAt, normalizedUsername);
  });

  transaction();
  return (await getSavedFlussonicConnectionProfile(normalizedUsername, profileId)) ?? null;
}

export async function deleteFlussonicConnectionProfile(panelUsername: string, profileId: string) {
  const normalizedUsername = normalizePanelUsername(panelUsername);
  const profile = await getSavedFlussonicConnectionProfile(normalizedUsername, profileId);
  if (!profile) return false;

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM flussonic_profiles WHERE profile_id = ? AND panel_username = ?`).run(
      profileId,
      normalizedUsername,
    );

    const nextActive = db
      .prepare(
        `SELECT profile_id
         FROM flussonic_profiles
         WHERE panel_username = ?
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(normalizedUsername) as { profile_id?: string } | undefined;

    db.prepare(
      `UPDATE users SET active_flussonic_profile_id = ?, updated_at = ?
       WHERE username = ?`,
    ).run(nextActive?.profile_id ?? null, nowIso(), normalizedUsername);

    if (nextActive?.profile_id) {
      db.prepare(
        `UPDATE flussonic_profiles SET is_active = CASE WHEN profile_id = ? THEN 1 ELSE 0 END
         WHERE panel_username = ?`,
      ).run(nextActive.profile_id, normalizedUsername);
    }
  });

  transaction();
  return true;
}

export async function clearFlussonicConnectionProfile(panelUsername: string) {
  const normalizedUsername = normalizePanelUsername(panelUsername);
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM flussonic_profiles WHERE panel_username = ?`).run(normalizedUsername);
    db.prepare(
      `UPDATE users SET active_flussonic_profile_id = NULL, updated_at = ?
       WHERE username = ?`,
    ).run(nowIso(), normalizedUsername);
  });

  transaction();
}
