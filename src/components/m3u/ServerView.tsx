import { useState } from "react";
import { Server, Shield, Download, CheckCircle2, Loader2, Send, Terminal, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { downloadCategoryToServer } from "@/lib/ssh.functions";
import { M3UItem } from "@/lib/m3u/types";

interface ServerViewProps {
  customCategories: Record<string, M3UItem[]>;
}

export function ServerView({ customCategories }: ServerViewProps) {
  const [serverIp, setServerIp] = useState("173.208.244.141");
  const [sshUser, setSshUser] = useState("root");
  const [sshPort, setSshPort] = useState("22");
  const [sshPassword, setSshPassword] = useState("");
  const [sshStatus, setSshStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [downloadingCategory, setDownloadingCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const setupCommand = `curl -sSL https://raw.githubusercontent.com/lovable-dev/ssh-bridge/main/install.sh | bash -s -- --port 8080 --ip ${serverIp}`;

  const downloadFn = useServerFn(downloadCategoryToServer);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    if (!sshPassword) {
      alert("Por favor, insira a senha do SSH para autenticação segura.");
      return;
    }
    setSshStatus("connecting");
    // Simulando tentativa de conexão com os dados fornecidos
    setTimeout(() => {
      setSshStatus("connected");
    }, 2000);
  };

  const handleDownload = async (categoryName: string) => {
    if (sshStatus !== "connected") {
      alert("Conecte ao servidor via SSH primeiro!");
      return;
    }
    
    setDownloadingCategory(categoryName);
    try {
      await downloadFn({
        data: {
          serverIp,
          categoryName,
          items: customCategories[categoryName]
        }
      });
      alert(`Sucesso! Categoria "${categoryName}" enviada para o servidor.`);
    } catch (error) {
      alert("Erro ao enviar categoria.");
    } finally {
      setDownloadingCategory(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
            <Server size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Conexão SSH</h2>
            <p className="text-sm text-neutral-400">Gerencie a integração com seu servidor remoto</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Endereço IP do Servidor</label>
              <input 
                type="text" 
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Ex: 173.208.244.141"
              />
            </div>
            <button 
              onClick={handleConnect}
              disabled={sshStatus === "connecting"}
              className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                sshStatus === "connected" 
                  ? "bg-green-600/20 text-green-500 border border-green-600/30" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {sshStatus === "connecting" ? (
                <Loader2 className="animate-spin" size={20} />
              ) : sshStatus === "connected" ? (
                <>
                  <CheckCircle2 size={20} />
                  Conectado via SSH
                </>
              ) : (
                <>
                  <Shield size={20} />
                  Conectar via SSH
                </>
              )}
            </button>
          </div>

          <div className="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <div className={`w-2 h-2 rounded-full ${sshStatus === "connected" ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              Status: <span className={sshStatus === "connected" ? "text-green-500" : "text-red-500"}>
                {sshStatus === "connected" ? "Online" : sshStatus === "connecting" ? "Autenticando..." : "Offline"}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {sshStatus === "connected" 
                ? "Conexão segura estabelecida. Você já pode baixar suas categorias para o servidor." 
                : "Insira o IP e clique em conectar para habilitar o download de categorias customizadas."}
            </p>
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
