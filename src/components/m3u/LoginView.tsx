import { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowRight, Lock, Shield, UserRound } from "lucide-react";
import { PanelAccount } from "@/lib/m3u/types";

interface LoginViewProps {
  account: PanelAccount;
  onLogin: (username: string, password: string) => { success: boolean; message: string };
}

export function LoginView({ account, onLogin }: LoginViewProps) {
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState(account.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUsername(account.username);
    setPassword(account.password);
  }, [account.username, account.password]);

  const submit = useCallback(() => {
    setLoading(true);
    const result = onLogin(username, password);
    if (!result.success) {
      setError(result.message);
    } else {
      setError("");
    }
    setLoading(false);
  }, [onLogin, password, username]);

  const handleUsernameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
  }, []);

  const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  const handlePasswordKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        submit();
      }
    },
    [submit],
  );

  return (
    <div className="min-h-screen bg-[#090909] text-white flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.10),transparent_30%)] pointer-events-none" />
      <div className="relative w-full max-w-4xl grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="rounded-3xl border border-white/10 bg-[#111111]/90 backdrop-blur-xl p-8 md:p-10 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-xl">
              M
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight">MAGO FLUSSONIC</div>
              <div className="text-sm text-neutral-400">Acesso ao painel administrativo</div>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-black leading-tight max-w-xl">
            Entre para gerenciar seus canais, categorias e downloads com segurança.
          </h1>
          <p className="mt-4 text-neutral-400 max-w-xl leading-relaxed">
            Use a conta do painel para acessar a interface completa. Você pode trocar o usuário e a
            senha depois, na aba Conta.
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Usuário
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                <UserRound size={18} className="text-neutral-500 shrink-0" />
                <input
                  value={username}
                  onChange={handleUsernameChange}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-neutral-600"
                  placeholder="mago@dono.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Senha
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                <Lock size={18} className="text-neutral-500 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-neutral-600"
                  placeholder="12345678"
                  onKeyDown={handlePasswordKeyDown}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-5 py-3 font-bold transition-colors"
            >
              <ArrowRight size={18} />
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111111]/90 backdrop-blur-xl p-8 md:p-10 flex flex-col justify-between">
          <div>
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 text-green-400 flex items-center justify-center mb-6">
              <Shield size={32} />
            </div>
            <h2 className="text-2xl font-black">Sessão protegida</h2>
            <p className="mt-3 text-neutral-400 leading-relaxed">
              O acesso é local no navegador. Ao sair, o painel volta para a tela de login e exige
              autenticação novamente.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs uppercase tracking-widest text-neutral-500">
              Credenciais atuais
            </div>
            <div className="mt-3 text-sm text-neutral-300 break-all">{account.username}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
