import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { FlussonicConnectionProfile, PanelAccount } from "@/lib/m3u/types";
import { readLocalStorageJSON, removeLocalStorageKeys, writeLocalStorageJSON } from "@/lib/storage";
import {
  clearFlussonicConnection as clearSavedFlussonicConnection,
  loadFlussonicConnectionProfile,
} from "@/lib/ssh.functions";

interface AccountViewProps {
  account: PanelAccount;
  setAccount: (account: PanelAccount) => void;
}

interface SavedConnection {
  serverIp?: string;
  sshUser?: string;
  sshPort?: string;
  sshPassword?: string;
  lastConnectedAt?: string;
}

const DEFAULT_ACCOUNT: PanelAccount = {
  username: "mago@dono.com",
  password: "12345678",
};

export function AccountView({ account, setAccount }: AccountViewProps) {
  const [savedConnection, setSavedConnection] = useState<SavedConnection | null>(null);
  const [savedProfilesCount, setSavedProfilesCount] = useState(0);
  const loadProfileFn = useServerFn(loadFlussonicConnectionProfile);

  useEffect(() => {
    let mounted = true;
    const loadFallbackConnection = () => {
      setSavedProfilesCount(0);
      setSavedConnection(
        readLocalStorageJSON<SavedConnection | null>("mago_flussonic_saved_connection", null),
      );
    };

    const hydrate = async () => {
      try {
        const result = (await loadProfileFn({
          data: {
            panelUsername: account.username,
          },
        })) as {
          success: boolean;
          message: string;
          profile: FlussonicConnectionProfile | null;
          profiles: FlussonicConnectionProfile[];
        };

        if (!mounted) return;

        if (result.success && result.profile) {
          setSavedProfilesCount(Array.isArray(result.profiles) ? result.profiles.length : 1);
          setSavedConnection({
            serverIp: result.profile.serverIp,
            sshUser: result.profile.sshUser,
            sshPort: String(result.profile.sshPort),
            sshPassword: result.profile.sshPassword,
            lastConnectedAt: result.profile.lastHealth?.lastCheckedAt || result.profile.updatedAt,
          });
          return;
        }
        loadFallbackConnection();
      } catch {
        loadFallbackConnection();
      }
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, [account.username, loadProfileFn]);

  const saveAccount = (next: PanelAccount) => {
    setAccount(next);
    writeLocalStorageJSON("mago_panel_account", next);
  };

  const clearLocalFlussonicConnection = () => {
    removeLocalStorageKeys(
      "mago_flussonic_saved_connection",
      "mago_flussonic_auto_connect",
      "mago_flussonic_ssh_password",
    );
    setSavedConnection(null);
  };

  const clearServerConnection = async () => {
    await clearSavedFlussonicConnection({
      data: {
        panelUsername: account.username,
      },
    });
    clearLocalFlussonicConnection();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-4xl">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
            <UserRound size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Conta do Painel</h2>
            <p className="text-sm text-neutral-400">
              Edite o usuário e a senha do painel quando precisar.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
              Usuário
            </label>
            <input
              value={account.username}
              onChange={(e) => saveAccount({ ...account, username: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
              placeholder="mago@dono.com"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
              Senha
            </label>
            <input
              type="password"
              value={account.password}
              onChange={(e) => saveAccount({ ...account, password: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
              placeholder="12345678"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => saveAccount(DEFAULT_ACCOUNT)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-bold transition-colors"
          >
            <KeyRound size={16} />
            Restaurar padrão
          </button>
        </div>
      </div>

      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-green-600/20 flex items-center justify-center text-green-500">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Conexão Flussonic Salva</h2>
            <p className="text-sm text-neutral-400">
              O painel mantém a última conexão autorizada para reconectar automaticamente.
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {savedProfilesCount > 0
                ? `${savedProfilesCount} servidor${savedProfilesCount === 1 ? "" : "es"} salvo${savedProfilesCount === 1 ? "" : "s"} para este usuário.`
                : "Nenhum servidor salvo ainda para este usuário."}
            </p>
          </div>
        </div>

        {savedConnection ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Host</div>
                <div className="font-mono text-sm mt-2 break-all">
                  {savedConnection.serverIp || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-widest text-neutral-500">
                  Usuário SSH
                </div>
                <div className="font-mono text-sm mt-2 break-all">
                  {savedConnection.sshUser || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Porta</div>
                <div className="font-mono text-sm mt-2 break-all">
                  {savedConnection.sshPort || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-widest text-neutral-500">
                  Última conexão
                </div>
                <div className="font-mono text-sm mt-2 break-all">
                  {savedConnection.lastConnectedAt
                    ? new Date(savedConnection.lastConnectedAt).toLocaleString("pt-BR")
                    : "-"}
                </div>
              </div>
            </div>

            <button
              onClick={() => void clearServerConnection()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/15 border border-red-500/20 text-red-400 hover:bg-red-600/25 text-sm font-bold transition-colors"
            >
              <Trash2 size={16} />
              Limpar conexão salva
            </button>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
            Nenhuma conexão Flussonic salva. Conecte no servidor para guardar o acesso
            automaticamente.
          </div>
        )}
      </div>
    </div>
  );
}
