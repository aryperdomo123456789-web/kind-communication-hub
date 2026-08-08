import { useState } from "react";
import { Tv, FolderPlus, Plus, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createFlussonicCategory, createFlussonicChannel, type FlussonicResponse } from "@/lib/flussonic.functions";

export function FlussonicView() {
  const [activeTab, setActiveTab] = useState<"category" | "channel">("category");
  const [loading, setLoading] = useState(false);
  
  // States for Category
  const [catName, setCatName] = useState("");
  
  // States for Channel
  const [channelName, setChannelName] = useState("");
  const [selectedCat, setSelectedCat] = useState("");
  const [videoList, setVideoList] = useState("");

  const createCatFn = useServerFn(createFlussonicCategory);
  const createChannelFn = useServerFn(createFlussonicChannel);

  const handleCreateCategory = async () => {
    if (!catName) return alert("Dê um nome para a categoria!");
    setLoading(true);
    try {
      const res = await createCatFn({ data: { name: catName } }) as FlussonicResponse;
      alert(res.message);
      if (res.success) setCatName("");
    } catch (e) {
      alert("Erro ao criar categoria.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName || !videoList) return alert("Preencha o nome do canal e a lista de vídeos!");
    setLoading(true);
    try {
      const res = await createChannelFn({ 
        data: { 
          name: channelName, 
          category: selectedCat,
          videos: videoList.split("\n").filter(v => v.trim())
        } 
      }) as FlussonicResponse;
      alert(res.message);
      if (res.success) {
        setChannelName("");
        setVideoList("");
      }
    } catch (e) {
      alert("Erro ao criar canal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-orange-600/20 flex items-center justify-center text-orange-500">
            <Tv size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Gestão Flussonic PRO</h2>
            <p className="text-sm text-neutral-400">Automatização de Canais 24h e Categorias no servidor 173.208.244.141</p>
          </div>
        </div>

        <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-8 w-fit border border-white/5">
          <button 
            onClick={() => setActiveTab("category")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "category" ? "bg-orange-600 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            Nova Categoria
          </button>
          <button 
            onClick={() => setActiveTab("channel")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "channel" ? "bg-orange-600 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            Novo Canal 24h
          </button>
        </div>

        {activeTab === "category" ? (
          <div className="max-w-xl space-y-6">
            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl flex gap-3 text-orange-200 text-sm">
              <Info size={20} className="shrink-0" />
              <p>Criar uma categoria organiza suas pastas em <code>/opt/flussonic/priv/[categoria]</code> e prepara o ambiente para novos canais.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Nome da Categoria</label>
                <input 
                  type="text" 
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: ANO NA ESCOLA"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={handleCreateCategory}
                disabled={loading}
                className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-600/20"
              >
                {loading ? <Loader2 className="animate-spin" /> : <FolderPlus size={20} />}
                Forjar Categoria no Servidor
              </button>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Nome do Canal</label>
                <input 
                  type="text" 
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="Ex: canal-01"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Categoria (Opcional)</label>
                <input 
                  type="text" 
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  placeholder="Ex: ano-na-escola"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none transition-all"
                />
                <p className="text-[10px] text-neutral-500 mt-1 italic">Deixe vazio se não quiser categoria.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Lista de Vídeos (1 por linha)</label>
                <textarea 
                  rows={6}
                  value={videoList}
                  onChange={(e) => setVideoList(e.target.value)}
                  placeholder="video01.mp4&#10;video02.mp4&#10;video03.mp4"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none transition-all font-mono text-sm"
                />
              </div>

              <button 
                onClick={handleCreateChannel}
                disabled={loading}
                className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-600/20"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Tv size={20} />}
                Ativar Canal 24h no Flussonic
              </button>
            </div>

            <div className="bg-black/20 rounded-2xl p-6 border border-white/5 space-y-4">
              <h3 className="font-bold text-orange-400 flex items-center gap-2">
                <AlertCircle size={18} /> Lógica de Guerrilha
              </h3>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li className="flex gap-2">
                  <span className="text-orange-500 font-bold">1.</span>
                  Os vídeos devem estar fisicamente no servidor em <code>/opt/flussonic/priv/</code>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-500 font-bold">2.</span>
                  O sistema criará a <code>playlist.txt</code> automaticamente.
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-500 font-bold">3.</span>
                  O arquivo <code>flussonic.conf</code> será atualizado e o serviço recarregado.
                </li>
              </ul>
              <div className="mt-6 p-4 bg-orange-500/5 rounded-xl border border-orange-500/10">
                <p className="text-xs text-orange-300 italic italic">
                  "Automatizar é o segredo da escala, parça. Enquanto os Nutella configuram na mão, a gente dá deploy em massa." - Mago Dev
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
