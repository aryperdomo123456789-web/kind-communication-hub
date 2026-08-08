import { Search, Plus, Play, Menu } from "lucide-react";
import { ViewType } from "@/hooks/use-m3u";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  activeView: ViewType;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isLoading: boolean;
  selectionMode: boolean;
  setSelectionMode: (mode: boolean) => void;
  selectedCount: number;
  onCreateCategory: (name: string) => void;
  onCancelSelection: () => void;
  onToggleSidebar?: () => void;
}

export function Header({
  activeView,
  searchQuery,
  setSearchQuery,
  isLoading,
  selectionMode,
  setSelectionMode,
  selectedCount,
  onCreateCategory,
  onCancelSelection,
  onToggleSidebar
}: HeaderProps) {
  const [newCatName, setNewCatName] = useState("");

  const handleCreate = () => {
    onCreateCategory(newCatName);
    setNewCatName("");
  };

  const titleMap: Record<ViewType, string> = {
    movies: "Filmes",
    series: "Séries",
    live: "Ao Vivo",
    custom: "Minhas Categorias",
    settings: "Gerenciar Listas"
  };

  return (
    <header className="h-16 md:h-20 flex items-center px-4 md:px-8 border-b border-neutral-800 justify-between bg-[#141414]/50 backdrop-blur-xl sticky top-0 z-10 gap-2 md:gap-4">
      <div className="flex items-center gap-2 md:gap-6 flex-1 min-w-0">
        <button 
          onClick={onToggleSidebar}
          className="lg:hidden p-2 hover:bg-neutral-800 rounded-lg text-neutral-400"
        >
          <Menu size={20} />
        </button>
        <h2 className="text-lg md:text-xl font-bold capitalize whitespace-nowrap overflow-hidden text-ellipsis">
          {titleMap[activeView]}
        </h2>
        
        {activeView !== "settings" && activeView !== "custom" && (
          <div className="relative flex-1 max-w-[200px] md:max-w-md hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18}/>
            <input 
              type="text" 
              placeholder={`Pesquisar em ${titleMap[activeView]}...`} 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isLoading && <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mr-2"></div>}
        
        {activeView !== "settings" && activeView !== "custom" && (
          <>
            {selectionMode ? (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                <input 
                  value={newCatName} 
                  onChange={e => setNewCatName(e.target.value)} 
                  placeholder="Nome da categoria..." 
                  className="bg-[#0a0a0a] border border-neutral-800 px-3 py-2 rounded-lg text-sm outline-none focus:border-blue-500"
                />
                <button 
                  onClick={handleCreate} 
                  disabled={selectedCount === 0 || !newCatName}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                >
                  <Plus size={16}/> Salvar ({selectedCount})
                </button>
                <button onClick={onCancelSelection} className="text-neutral-400 hover:text-white px-3 text-sm">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setSelectionMode(true)} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition-all">
                <Plus size={16}/> Criar Categoria
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
