import { List, Plus, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface SettingsProps {
  lists: { name: string; url: string }[];
  activeUrl: string;
  onAdd: (name: string, url: string) => void;
  onRemove: (url: string) => void;
  onProcess: (url: string) => void;
}

export function SettingsView({ lists, activeUrl, onAdd, onRemove, onProcess }: SettingsProps) {
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const handleAdd = () => {
    if (newName && newUrl) {
      onAdd(newName, newUrl);
      setNewName("");
      setNewUrl("");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-neutral-800 shadow-2xl">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Plus className="text-blue-500" size={20}/> Adicionar Nova Lista M3U
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-xs text-neutral-500 uppercase font-bold px-1">Nome de Exibição</label>
            <input 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              placeholder="Ex: Lista Premium" 
              className="w-full bg-[#0a0a0a] border border-neutral-800 p-3 rounded-xl outline-none focus:border-blue-600 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-neutral-500 uppercase font-bold px-1">URL do Link M3U</label>
            <input 
              value={newUrl} 
              onChange={e => setNewUrl(e.target.value)} 
              placeholder="http://..." 
              className="w-full bg-[#0a0a0a] border border-neutral-800 p-3 rounded-xl outline-none focus:border-blue-600 transition-all"
            />
          </div>
        </div>
        <button 
          onClick={handleAdd}
          className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
        >
          Salvar Lista no Sistema
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm text-neutral-500 uppercase font-bold px-2 tracking-widest">Suas Listas Configuradas</h3>
        <div className="grid gap-3">
          {lists.map(list => (
            <div key={list.url} className={`group flex items-center justify-between p-5 rounded-2xl border transition-all ${activeUrl === list.url ? "bg-blue-600/5 border-blue-600/50 shadow-inner shadow-blue-600/5" : "bg-[#141414] border-neutral-800 hover:border-neutral-700"}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeUrl === list.url ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>
                  <List size={24}/>
                </div>
                <div>
                  <p className="font-bold text-lg">{list.name}</p>
                  <p className="text-xs text-neutral-500 truncate max-w-md mt-0.5">{list.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {activeUrl === list.url ? (
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-sm bg-blue-400/10 px-4 py-2 rounded-lg">
                    <CheckCircle2 size={16}/> Ativa Agora
                  </div>
                ) : (
                  <button 
                    onClick={() => onProcess(list.url)} 
                    className="px-6 py-2.5 bg-neutral-800 hover:bg-blue-600 rounded-lg text-sm font-bold transition-all"
                  >
                    Carregar Esta Lista
                  </button>
                )}
                <button 
                  onClick={() => onRemove(list.url)} 
                  className="p-2 text-neutral-600 hover:text-red-500 transition-colors"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
