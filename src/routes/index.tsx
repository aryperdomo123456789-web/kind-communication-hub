import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { parseM3U, M3UParsed, M3UItem } from "@/lib/m3u";
import { Play, Film, Tv, ChevronLeft, ArrowRight, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  const [m3uText, setM3uText] = useState("http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls");
  
  const [activeView, setActiveView] = useState<"movies" | "series" | "live" | "custom">("movies");
  
  // Custom Categories
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>({});
  const [newCatName, setNewCatName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Navigation
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleProcess = async () => {
    setIsLoading(true);
    try {
      const parsed = await parseM3U(m3uText);
      setData(parsed);
    } catch (error) {
      console.error("Erro ao processar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { handleProcess(); }, []);

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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#141414] border-r border-neutral-800 flex flex-col p-4 gap-4">
          <div className="text-blue-500 font-bold text-xl px-2">XCIPTV PRO</div>
          <nav className="flex flex-col gap-2">
            {["movies", "series", "live", "custom"].map((v) => (
              <button key={v} onClick={() => setActiveView(v as any)} className={`p-3 rounded-lg capitalize ${activeView === v ? "bg-blue-600" : "hover:bg-neutral-800"}`}>
                {v === "custom" ? "Minhas Categorias" : v}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <header className="h-16 flex items-center px-8 border-b border-neutral-800 justify-between">
            <h2 className="text-xl capitalize">{activeView}</h2>
            <div className="flex gap-2">
              <button onClick={() => setSelectionMode(!selectionMode)} className="px-4 py-2 bg-neutral-800 rounded">
                {selectionMode ? "Cancelar Seleção" : "Selecionar Conteúdo"}
              </button>
              {selectionMode && (
                <div className="flex gap-2">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nome da Categoria" className="bg-neutral-800 px-2 rounded text-sm"/>
                  <button onClick={createCustomCategory} className="bg-blue-600 px-4 rounded text-sm">Salvar</button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-8">
            {selectionMode && <p className="text-blue-400 mb-4">Modo de Seleção Ativo: Selecione os itens e crie sua categoria.</p>}
            
            {activeView === "custom" ? (
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
