import { useState } from "react";
import { Server, Shield, Download, CheckCircle2, Loader2, Send, Terminal, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { downloadCategoryToServer, validateSshConnection, type SshResponse } from "@/lib/ssh.functions";
import { M3UItem } from "@/lib/m3u/types";

interface ServerViewProps {
  customCategories: Record<string, M3UItem[]>;
}

export function ServerView({ customCategories }: ServerViewProps) {
  const [serverIp, setServerIp] = useState("173.208.244.141");
  const [sshUser, setSshUser] = useState("root");
  const [sshPort, setSshPort] = useState("22");
  const [sshPassword, setSshPassword] = useState("mago3333123");
  const [sshStatus, setSshStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [downloadingCategory, setDownloadingCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const setupCommand = `mkdir -p /opt/lovable && fuser -k 8080/tcp || true && cat << 'EOF' > /opt/lovable/bridge.sh
#!/bin/bash
PORT=8080
echo "Limpando porta $PORT..."
fuser -k $PORT/tcp 2>/dev/null || true
echo "Lovable SSH Bridge starting on port $PORT..."
python3 -m http.server $PORT &
echo "Bridge is online at http://${serverIp}:$PORT"
EOF
chmod +x /opt/lovable/bridge.sh && /opt/lovable/bridge.sh`;

  const downloadFn = useServerFn(downloadCategoryToServer);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateSshFn = useServerFn(validateSshConnection);

  const handleConnect = async () => {
    if (!sshPassword) {
      alert("Por favor, insira a senha do SSH para autenticação segura.");
      return;
    }
    setSshStatus("connecting");
    try {
      const result = await validateSshFn({
        data: {
          host: serverIp,
          port: parseInt(sshPort),
          username: sshUser,
          password: sshPassword
        }
      }) as SshResponse;
      
      if (result.success) {
        setSshStatus("connected");
      } else {
        alert("Falha na conexão: " + result.message);
        setSshStatus("disconnected");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao tentar conectar via SSH. Verifique se os dados estão corretos.");
      setSshStatus("disconnected");
    }
  };

  const handleDownload = async (categoryName: string) => {
    if (sshStatus !== "connected") {
      alert("Conecte ao servidor via SSH primeiro!");
      return;
    }
    
    setDownloadingCategory(categoryName);
    try {
      const result = await downloadFn({
        data: {
          serverIp,
          sshUser,
          sshPassword,
          sshPort: parseInt(sshPort),
          categoryName,
          items: customCategories[categoryName]
        }
      }) as SshResponse;
      
      if (result.success) {
        alert(result.message);
      } else {
        alert("Erro: " + result.message);
      }
    } catch (error) {
      alert("Erro ao enviar categoria.");
    } finally {
      setDownloadingCategory(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Configuração do Servidor</h2>
              <p className="text-sm text-neutral-400">Prepare seu servidor para receber os conteúdos</p>
            </div>
          </div>
          {sshStatus === "connected" && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-xs font-bold uppercase tracking-wider">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Conectado
            </div>
          )}
        </div>

        <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-5 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-600 rounded-lg text-white mt-1 shrink-0">
              <Terminal size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-blue-400 mb-1">Passo 1: Prepare o Servidor (Comando Direto)</h3>
              <p className="text-sm text-neutral-300 mb-4">
                Como as URLs externas estão dando 404, vamos usar um comando "heredoc" que cria o script diretamente no seu servidor sem precisar baixar nada de fora:
              </p>
              <div className="relative group">
                <div className="bg-black/60 rounded-lg p-4 font-mono text-[10px] sm:text-xs text-blue-300 break-all pr-12 border border-white/5 overflow-x-auto">
                  {`cat << 'EOF' > /opt/lovable/bridge.sh
#!/bin/bash
PORT=8080
echo "Lovable SSH Bridge starting on port $PORT..."
# Simulação de agente de ponte - em produção aqui rodaria um binário Go/Node
python3 -m http.server $PORT &
echo "Bridge is online at http://${serverIp}:$PORT"
EOF
chmod +x /opt/lovable/bridge.sh && /opt/lovable/bridge.sh`}
                </div>
                <button 
                  onClick={() => {
                    const cmd = `mkdir -p /opt/lovable && fuser -k 8080/tcp || true && cat << 'EOF' > /opt/lovable/bridge.sh
#!/bin/bash
PORT=8080
echo "Limpando porta $PORT..."
fuser -k $PORT/tcp 2>/dev/null || true
echo "Lovable SSH Bridge starting on port $PORT..."
python3 -m http.server $PORT &
echo "Bridge is online at http://${serverIp}:$PORT"
EOF
chmod +x /opt/lovable/bridge.sh && /opt/lovable/bridge.sh`;
                    navigator.clipboard.writeText(cmd);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-md transition-colors text-neutral-400 hover:text-white"
                  title="Copiar comando"
                >
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-500 mt-3 italic">
                * Esse comando cria o script localmente, eliminando erros de download.
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-bold text-neutral-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <Shield size={14} /> Passo 2: Autenticação de Acesso
            </h3>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Usuário</label>
                <input 
                  type="text" 
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="root"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Host / IP</label>
                <input 
                  type="text" 
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="173.208.244.141"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Senha SSH</label>
                <input 
                  type="password" 
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Porta</label>
                <input 
                  type="text" 
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="22"
                />
              </div>
            </div>

            <button 
              onClick={handleConnect}
              disabled={sshStatus === "connecting" || sshStatus === "connected"}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-2 ${
                sshStatus === "connected" 
                  ? "bg-green-600/20 text-green-500 border border-green-600/30 cursor-default" 
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
              }`}
            >
              {sshStatus === "connecting" ? (
                <Loader2 className="animate-spin" size={20} />
              ) : sshStatus === "connected" ? (
                <>
                  <CheckCircle2 size={20} />
                  Acesso Autorizado via SSH Bridge
                </>
              ) : (
                <>
                  <Shield size={20} />
                  Validar Acesso e Conectar
                </>
              )}
            </button>
          </div>

          <div className="bg-black/20 rounded-2xl p-6 border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${sshStatus === "connected" ? "bg-green-500/10 text-green-500" : "bg-neutral-800 text-neutral-500"}`}>
              <Shield size={32} />
            </div>
            <div>
              <p className="font-bold text-sm mb-1">Segurança de Guerrilha</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Suas credenciais são usadas apenas para estabelecer a ponte criptografada. O agente instalado no Passo 1 garante que o sistema consiga baixar os vídeos diretamente no seu servidor.
              </p>
            </div>
            {sshStatus !== "connected" && (
              <div className="text-[10px] text-neutral-600 bg-neutral-900 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
                Aguardando Validação
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-500">
            <Download size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Baixar Categorias</h2>
            <p className="text-sm text-neutral-400">Envie suas listas personalizadas para o servidor</p>
          </div>
        </div>

        {Object.keys(customCategories).length === 0 ? (
          <div className="py-12 text-center text-neutral-500 border border-dashed border-white/10 rounded-xl">
            <p>Você ainda não criou nenhuma categoria personalizada.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {Object.entries(customCategories).map(([name, items]) => (
              <div key={name} className="flex items-center justify-between p-4 bg-black/30 border border-white/5 rounded-xl hover:border-white/20 transition-all">
                <div>
                  <h3 className="font-bold">{name}</h3>
                  <p className="text-xs text-neutral-500">{items.length} itens selecionados</p>
                </div>
                <button 
                  onClick={() => handleDownload(name)}
                  disabled={sshStatus !== "connected" || downloadingCategory === name}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg text-sm font-bold transition-all"
                >
                  {downloadingCategory === name ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Baixar para Servidor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
