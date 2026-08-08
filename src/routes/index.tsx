import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { parseM3U, M3UParsed, M3UItem } from "@/lib/m3u";
import { Play, Film, Tv, ChevronLeft, ArrowRight, Plus, Search, Settings } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  
  // Listas M3U (PERSISTÊNCIA)
  const [m3uLists, setM3uLists] = useState<{name: string, url: string}[]>([
    { name: "Principal", url: "http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls" },
    { name: "Secundária", url: "http://ctfautt.cc:80/get.php?username=4nXdgX37oV&password=pLxSa2hRSP&type=m3u_plus&output=hls" }
  ]);
  const [activeListUrl, setActiveListUrl] = useState(m3uLists[0].url);
  const [newListName, setNewListName] = useState("");
  const [newListUrl, setNewListUrl] = useState("");
  
  const [activeView, setActiveView] = useState<"movies" | "series" | "live" | "custom" | "settings">("movies");
  
  // Custom Categories
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>({});
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

  useEffect(() => { handleProcess(activeListUrl); }, []);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const createCustomCategory = () => {
    if (!newCatName || selectedIds.size === 0 || !data) return;
    const allItems = [...data.movies.flatMap(c => c.items), ...data.series.flatMap(s => s.seasons.flatMap(s => s.episodes)), ...data.live.flatMap(c => c.items)];
    const selected = allItems.filter(i => selectedIds.has(i.id));
    setCustomCategories({...customCategories, [newCatName]: selected});
    setNewCatName("");
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#141414] border-r border-neutral-800 flex flex-col p-4 gap-4">
          <div className="text-blue-500 font-bold text-xl px-2">XCIPTV PRO</div>
          <nav className="flex flex-col gap-2">
            {["movies", "series", "live", "custom", "settings"].map((v) => (
              <button key={v} onClick={() => setActiveView(v as any)} className={`p-3 rounded-lg capitalize flex items-center gap-3 ${activeView === v ? "bg-blue-600" : "hover:bg-neutral-800"}`}>
                {v === "movies" && <Film size={18}/>}
                {v === "series" && <Tv size={18}/>}
                {v === "live" && <Play size={18}/>}
                {v === "settings" && <Settings size={18}/>}
                {v === "custom" ? "Minhas Categorias" : v === "settings" ? "Listas M3U" : v}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <header className="h-16 flex items-center px-8 border-b border-neutral-800 justify-between">
            <h2 className="text-xl capitalize">{activeView === "settings" ? "Gerenciamento de Listas" : activeView}</h2>
          </header>

          <main className="flex-1 overflow-y-auto p-8">
            {activeView === "settings" ? (
              <div className="space-y-8">
                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-neutral-800">
                  <h3 className="font-bold mb-4">Adicionar Nova Lista</h3>
                  <div className="flex gap-2">
                    <input value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="Nome da Lista" className="bg-[#0a0a0a] p-2 rounded flex-1"/>
                    <input value={newListUrl} onChange={e => setNewListUrl(e.target.value)} placeholder="URL M3U" className="bg-[#0a0a0a] p-2 rounded flex-[2]"/>
                    <button onClick={() => { setM3uLists([...m3uLists, {name: newListName, url: newListUrl}]); setNewListName(""); setNewListUrl(""); }} className="bg-blue-600 px-4 py-2 rounded">Adicionar</button>
                  </div>
                </div>
                <div className="grid gap-4">
                  {m3uLists.map(list => (
                    <div key={list.url} className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-neutral-800">
                      <div>
                        <p className="font-bold">{list.name}</p>
                        <p className="text-xs text-neutral-500 truncate max-w-lg">{list.url}</p>
                      </div>
                      <button onClick={() => handleProcess(list.url)} className={`px-4 py-2 rounded ${activeListUrl === list.url ? "bg-green-600" : "bg-neutral-800"}`}>
                        {activeListUrl === list.url ? "Ativa" : "Ativar"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeView === "custom" ? (
              Object.entries(customCategories).map(([name, items]) => (
                <div key={name} className="mb-8">
                  <h3 className="font-bold mb-4">{name}</h3>
                  <div className="grid grid-cols-6 gap-4">
                    {items.map(i => <div key={i.id} className="p-2 border border-neutral-800 rounded truncate text-xs">{i.name}</div>)}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-6 gap-4">
                {data?.movies.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                  <div key={item.id} className={`relative p-2 border ${selectedIds.has(item.id) ? "border-blue-500 bg-blue-900/20" : "border-neutral-800"} rounded cursor-pointer`} onClick={() => selectionMode ? toggleSelection(item.id) : null}>
                    <p className="truncate text-xs">{item.name}</p>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
