import { useState, useEffect, useCallback } from "react";
import { parseM3U, M3UParsed, M3UItem, M3UCategory } from "@/lib/m3u";

export type ViewType = "movies" | "series" | "live" | "custom" | "settings";

export function useM3U() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  const [activeView, setActiveView] = useState<ViewType>("movies");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Listas M3U Persistence
  const [m3uLists, setM3uLists] = useState<{name: string, url: string}[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem("m3u_lists");
      if (saved) return JSON.parse(saved);
      
      const defaultLists = [
        { name: "Principal", url: "http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls" },
        { name: "Secundária", url: "http://ctfautt.cc:80/get.php?username=4nXdgX37oV&password=pLxSa2hRSP&type=m3u_plus&output=hls" }
      ];
      localStorage.setItem("m3u_lists", JSON.stringify(defaultLists));
      return defaultLists;
    } catch (e) {
      return [];
    }
  });

  const [activeListUrl, setActiveListUrl] = useState(m3uLists[0]?.url || "");

  // Custom Categories Persistence
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem("custom_categories");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const handleProcess = useCallback(async (url: string) => {
    if (!url || isLoading) return;
    setIsLoading(true);
    setActiveListUrl(url);
    try {
      console.log("Iniciando auditoria e processamento da M3U:", url);
      const parsed = await parseM3U(url);
      
      if (parsed && (parsed.movies.length > 0 || parsed.series.length > 0 || parsed.live.length > 0)) {
        console.log(`Sucesso! Encontrados: ${parsed.movies.length} categorias de filmes, ${parsed.series.length} séries.`);
        setData(parsed);
        if (activeView === "settings") setActiveView("movies");
      } else {
        console.error("M3U vazia ou formato inválido detectado na auditoria.");
        alert("A lista M3U parece estar vazia ou o servidor não respondeu corretamente. Verifique a URL.");
      }
    } catch (error) {
      console.error("Erro crítico no motor de processamento:", error);
      alert("Erro ao processar lista. O proxy pode estar sobrecarregado ou a URL é inválida.");
    } finally {
      setIsLoading(false);
    }
  }, [activeView, isLoading]);

  useEffect(() => {
    localStorage.setItem("m3u_lists", JSON.stringify(m3uLists));
  }, [m3uLists]);

  useEffect(() => {
    localStorage.setItem("custom_categories", JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    if (activeListUrl) handleProcess(activeListUrl);
  }, [activeListUrl, handleProcess]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const createCustomCategory = (name: string) => {
    if (!name || selectedIds.size === 0 || !data) return;
    
    const allItems = [
      ...data.movies.flatMap((c: M3UCategory) => c.items), 
      ...data.series.flatMap((s: any) => s.seasons.flatMap((ss: any) => ss.episodes)), 
      ...data.live.flatMap((c: M3UCategory) => c.items)
    ];
    
    const selected = allItems.filter(i => selectedIds.has(i.id));
    setCustomCategories(prev => ({
      ...prev, 
      [name]: [...(prev[name] || []), ...selected]
    }));
    
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const deleteCustomCategory = (name: string) => {
    setCustomCategories(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const addM3UList = (name: string, url: string) => {
    if (!name || !url) return;
    setM3uLists(prev => [...prev, { name, url }]);
  };

  const removeM3UList = (url: string) => {
    setM3uLists(prev => prev.filter(l => l.url !== url));
  };

  const getFilteredItems = useCallback(() => {
    if (!data) return [];
    
    let source: M3UItem[] = [];
    if (activeView === "movies") {
      source = data.movies.flatMap((c: M3UCategory) => c.items);
    } else if (activeView === "live") {
      source = data.live.flatMap((c: M3UCategory) => c.items);
    } else if (activeView === "series") {
      source = data.series.flatMap((s: any) => s.seasons.flatMap((ss: any) => ss.episodes));
    }
    
    if (!searchQuery) return source;
    
    return source.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [data, activeView, searchQuery]);

  return {
    isLoading,
    data,
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
    selectionMode,
    setSelectionMode,
    selectedIds,
    m3uLists,
    activeListUrl,
    customCategories,
    handleProcess,
    toggleSelection,
    createCustomCategory,
    deleteCustomCategory,
    addM3UList,
    removeM3UList,
    getFilteredItems,
    setSelectedIds
  };
}
