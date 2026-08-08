import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { parseM3U, M3UParsed, M3UItem } from "@/lib/m3u";
import { Play, Film, Tv, ChevronLeft, ArrowRight, Plus, Search, Settings, List, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  
  // Listas M3U (PERSISTÊNCIA)
  const [m3uLists, setM3uLists] = useState<{name: string, url: string}[]>(() => {
    const saved = localStorage.getItem("m3u_lists");
    return saved ? JSON.parse(saved) : [
      { name: "Principal", url: "http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls" },
      { name: "Secundária", url: "http://ctfautt.cc:80/get.php?username=4nXdgX37oV&password=pLxSa2hRSP&type=m3u_plus&output=hls" }
    ];
  });
  
  const [activeListUrl, setActiveListUrl] = useState(m3uLists[0]?.url || "");
  const [newListName, setNewListName] = useState("");
  const [newListUrl, setNewListUrl] = useState("");
  
  const [activeView, setActiveView] = useState<"movies" | "series" | "live" | "custom" | "settings">("movies");
  
  // Custom Categories
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>(() => {
    const saved = localStorage.getItem("custom_categories");
    return saved ? JSON.parse(saved) : {};
  });
  const [newCatName, setNewCatName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Navigation
  const [searchQuery, setSearchQuery] = useState("");

  const handleProcess = async (url: string) => {
    setIsLoading(true);
    setActiveListUrl(url);
    try {
      const parsed = await parseM3U(url);
      setData(parsed);
      setActiveView("movies");
    } catch (error) {
      console.error("Erro ao processar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("m3u_lists", JSON.stringify(m3uLists));
  }, [m3uLists]);

  useEffect(() => {
    localStorage.setItem("custom_categories", JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => { if (activeListUrl) handleProcess(activeListUrl); }, []);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const createCustomCategory = () => {
    if (!newCatName || selectedIds.size === 0 || !data) return;
    const allItems = [
      ...data.movies.flatMap(c => c.items), 
      ...data.series.flatMap(s => s.seasons.flatMap(s => s.episodes)), 
      ...data.live.flatMap(c => c.items)
    ];
    const selected = allItems.filter(i => selectedIds.has(i.id));
    setCustomCategories({...customCategories, [newCatName]: [...(customCategories[newCatName] || []), ...selected]});
    setNewCatName("");
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const getFilteredItems = () => {
    if (!data) return [];
    const all = [
      ...data.movies.flatMap(c => c.items),
      ...data.live.flatMap(c => c.items),
      ...data.series.flatMap(s => s.seasons.flatMap(ss => ss.episodes))
    ];
    
    if (activeView === "movies") return data.movies.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (activeView === "live") return data.live.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (activeView === "series") return data.series.flatMap(s => s.seasons.flatMap(ss => ss.episodes)).filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return [];
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-600/30">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-[#141414] border-r border-neutral-800 flex flex-col p-4 gap-4">
          <div className="flex items-center gap-2 px-2 py-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">X</div>
            <div className="text-blue-500 font-bold text-xl tracking-tight">XCIPTV PRO</div>
          </div>
          
          <nav className="flex flex-col gap-1">
            <button onClick={() => { setActiveView("movies"); setSearchQuery(""); }} className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "movies" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <Film size={20}/> <span className="font-medium">Filmes</span>
            </button>
            <button onClick={() => { setActiveView("series"); setSearchQuery(""); }} className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "series" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <Tv size={20}/> <span className="font-medium">Séries</span>
            </button>
            <button onClick={() => { setActiveView("live"); setSearchQuery(""); }} className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "live" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <Play size={20}/> <span className="font-medium">Ao Vivo</span>
            </button>
            
            <div className="h-px bg-neutral-800 my-4" />
            
            <button onClick={() => setActiveView("custom")} className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "custom" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <List size={20}/> <span className="font-medium">Minhas Categorias</span>
            </button>
            <button onClick={() => setActiveView("settings")} className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "settings" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <Settings size={20}/> <span className="font-medium">Listas M3U</span>
            </button>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-[#0d0d0d]">
          <header className="h-20 flex items-center px-8 border-b border-neutral-800 justify-between bg-[#141414]/50 backdrop-blur-xl sticky top-0 z-10">
            <div className="flex items-center gap-6 flex-1">
              <h2 className="text-xl font-bold capitalize min-w-[150px]">
                {activeView === "settings" ? "Gerenciar Listas" : activeView === "custom" ? "Customizadas" : activeView}
              </h2>
              
              {activeView !== "settings" && activeView !== "custom" && (
                <div className="relative max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18}/>
                  <input 
                    type="text" 
                    placeholder={`Pesquisar em ${activeView}...`} 
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
                        onClick={createCustomCategory} 
                        disabled={selectedIds.size === 0 || !newCatName}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                      >
                        <Plus size={16}/> Salvar ({selectedIds.size})
                      </button>
                      <button onClick={() => {setSelectionMode(false); setSelectedIds(new Set());}} className="text-neutral-400 hover:text-white px-3 text-sm">Cancelar</button>
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

          <main className="flex-1 overflow-y-auto p-8">
            {activeView === "settings" ? (
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
                <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-neutral-800 shadow-2xl">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Plus className="text-blue-500" size={20}/> Adicionar Nova Lista M3U
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                      <label className="text-xs text-neutral-500 uppercase font-bold px-1">Nome de Exibição</label>
                      <input value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="Ex: Lista Premium" className="w-full bg-[#0a0a0a] border border-neutral-800 p-3 rounded-xl outline-none focus:border-blue-600 transition-all"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-neutral-500 uppercase font-bold px-1">URL do Link M3U</label>
                      <input value={newListUrl} onChange={e => setNewListUrl(e.target.value)} placeholder="http://..." className="w-full bg-[#0a0a0a] border border-neutral-800 p-3 rounded-xl outline-none focus:border-blue-600 transition-all"/>
                    </div>
                  </div>
                  <button 
                    onClick={() => { if(newListName && newListUrl) { setM3uLists([...m3uLists, {name: newListName, url: newListUrl}]); setNewListName(""); setNewListUrl(""); } }} 
                    className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    Salvar Lista no Sistema
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm text-neutral-500 uppercase font-bold px-2 tracking-widest">Suas Listas Configuradas</h3>
                  <div className="grid gap-3">
                    {m3uLists.map(list => (
                      <div key={list.url} className={`group flex items-center justify-between p-5 rounded-2xl border transition-all ${activeListUrl === list.url ? "bg-blue-600/5 border-blue-600/50 shadow-inner shadow-blue-600/5" : "bg-[#141414] border-neutral-800 hover:border-neutral-700"}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeListUrl === list.url ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>
                            <List size={24}/>
                          </div>
                          <div>
                            <p className="font-bold text-lg">{list.name}</p>
                            <p className="text-xs text-neutral-500 truncate max-w-md mt-0.5">{list.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {activeListUrl === list.url ? (
                            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm bg-blue-400/10 px-4 py-2 rounded-lg">
                              <CheckCircle2 size={16}/> Ativa Agora
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleProcess(list.url)} 
                              className="px-6 py-2.5 bg-neutral-800 hover:bg-blue-600 rounded-lg text-sm font-bold transition-all"
                            >
                              Carregar Esta Lista
                            </button>
                          )}
                          <button onClick={() => setM3uLists(m3uLists.filter(l => l.url !== list.url))} className="p-2 text-neutral-600 hover:text-red-500 transition-colors">
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeView === "custom" ? (
              <div className="space-y-12 animate-in fade-in">
                {Object.entries(customCategories).length === 0 ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-neutral-600">
                    <List size={64} className="mb-4 opacity-20"/>
                    <p className="text-lg">Nenhuma categoria personalizada criada ainda.</p>
                    <p className="text-sm mt-1">Selecione conteúdos nas outras abas para criar as suas.</p>
                  </div>
                ) : (
                  Object.entries(customCategories).map(([name, items]) => (
                    <div key={name} className="space-y-6">
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <div className="w-2 h-8 bg-blue-600 rounded-full" /> {name}
                        </h3>
                        <button 
                          onClick={() => { const next = {...customCategories}; delete next[name]; setCustomCategories(next); }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Excluir Categoria
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                        {items.map(item => (
                          <div key={item.id} className="group relative aspect-[2/3] bg-[#1a1a1a] rounded-xl overflow-hidden border border-neutral-800 hover:border-blue-500 transition-all">
                            {item.logo ? <img src={item.logo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-700"><Film size={32}/></div>}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent opacity-80" />
                            <p className="absolute bottom-2 left-2 right-2 text-[10px] font-bold truncate text-white">{item.name}</p>
                            <a href={item.url} target="_blank" className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                              <Play fill="white" size={24}/>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                {selectionMode && (
                  <div className="bg-blue-600/10 border border-blue-600/20 p-4 rounded-xl flex items-center gap-3 text-blue-400 mb-8">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">!</div>
                    <div>
                      <p className="font-bold">Modo de Seleção Ativo</p>
                      <p className="text-xs opacity-80">Clique nos itens para selecionar e depois dê um nome para sua nova categoria no topo.</p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {getFilteredItems().map(item => (
                    <div 
                      key={item.id} 
                      className={`group relative aspect-[2/3] bg-[#1a1a1a] rounded-xl overflow-hidden border transition-all cursor-pointer ${selectedIds.has(item.id) ? "border-blue-500 ring-2 ring-blue-600/50" : "border-neutral-800 hover:border-neutral-600"}`}
                      onClick={() => selectionMode ? toggleSelection(item.id) : null}
                    >
                      {item.logo ? (
                        <img src={item.logo} className={`w-full h-full object-cover transition-transform duration-500 ${selectionMode ? "" : "group-hover:scale-110"}`} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-800">
                          {activeView === "movies" ? <Film size={48}/> : activeView === "series" ? <Tv size={48}/> : <Play size={48}/>}
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />
                      
                      {selectedIds.has(item.id) && (
                        <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1 shadow-lg">
                          <CheckCircle2 size={16}/>
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-[11px] font-bold leading-tight line-clamp-2 text-white group-hover:text-blue-400 transition-colors">{item.name}</p>
                        {item.type === "series" && <p className="text-[9px] text-neutral-400 mt-1">S{item.season} E{item.episode}</p>}
                      </div>

                      {!selectionMode && (
                        <a 
                          href={item.url} 
                          target="_blank" 
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm"
                        >
                          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-all">
                            <Play fill="white" size={24} className="ml-1" />
                          </div>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                
                {getFilteredItems().length === 0 && !isLoading && (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-neutral-600">
                    <Search size={48} className="mb-4 opacity-20"/>
                    <p>Nenhum resultado encontrado para "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
