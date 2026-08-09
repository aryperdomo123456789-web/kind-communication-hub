import { useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { parseM3U } from "@/lib/m3u";
import {
  M3UParsed,
  M3UItem,
  M3UCategory,
  M3USeriesCategory,
  FlussonicStreamInfo,
  FlussonicMirrorSnapshot,
  PanelAccount,
} from "@/lib/m3u/types";
import { useServerFn } from "@tanstack/react-start";
import { loadPanelAccount, savePanelAccountFn } from "@/lib/ssh.functions";
import { readLocalStorageJSON, writeLocalStorageJSON, writeLocalStorageValue } from "@/lib/storage";

export type ViewType = "movies" | "series" | "live" | "custom" | "settings" | "server" | "account" | "flussonic";
export type ContentView = "movies" | "series" | "live";

const DEFAULT_M3U_LIST = {
  name: "Principal",
  url: "http://servicedovod.shop:80/get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls",
};

const DEFAULT_PANEL_ACCOUNT: PanelAccount = {
  username: "mago@dono.com",
  password: "12345678",
};

export function useM3U() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  const [activeView, setActiveView] = useState<ViewType>("movies");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("mago_panel_session") === "1";
  });
  const [panelAccount, setPanelAccount] = useState<PanelAccount>(() => ({
    ...DEFAULT_PANEL_ACCOUNT,
    ...readLocalStorageJSON("mago_panel_account", {}),
  }));
  const loadPanelAccountFn = useServerFn(loadPanelAccount);
  const savePanelAccountServerFn = useServerFn(savePanelAccountFn);
  const accountHydratedRef = useRef(false);
  const [activeCategories, setActiveCategories] = useState<Record<ContentView, string>>(() => {
    if (typeof window === "undefined") {
      return { movies: "ALL", series: "ALL", live: "ALL" };
    }

    return {
      movies: localStorage.getItem("mago_category_movies") || "ALL",
      series: localStorage.getItem("mago_category_series") || "ALL",
      live: localStorage.getItem("mago_category_live") || "ALL",
    };
  });

  // Listas M3U Persistence
  const [m3uLists, setM3uLists] = useState<{ name: string; url: string }[]>(() => [
    DEFAULT_M3U_LIST,
  ]);

  const [activeListUrl, setActiveListUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("active_m3u_url") || DEFAULT_M3U_LIST.url;
  });

  useEffect(() => {
    writeLocalStorageValue("active_m3u_url", activeListUrl);
  }, [activeListUrl]);

  // Custom Categories Persistence
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>(() => {
    if (typeof window === "undefined") return {};
    return readLocalStorageJSON("custom_categories", {});
  });

  const [flussonicStreams, setFlussonicStreams] = useState<FlussonicStreamInfo[]>([]);
  const [flussonicMirror, setFlussonicMirror] = useState<FlussonicMirrorSnapshot | null>(null);
  const isProcessingRef = useRef(false);

  const handleProcess = useCallback(
    async (url: string) => {
      if (!url || isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsLoading(true);
      try {
        const parsed = await parseM3U(url);

        if (
          parsed &&
          (parsed.movies.length > 0 || parsed.series.length > 0 || parsed.live.length > 0)
        ) {
          setData(parsed);
          setActiveView((current) => (current === "settings" ? "movies" : current));
        } else {
          console.error("M3U vazia ou formato inválido detectado na auditoria.");
          alert(
            "A lista M3U parece estar vazia ou o servidor não respondeu corretamente. Verifique a URL.",
          );
        }
      } catch (error) {
        console.error("Erro crítico no motor de processamento:", error);
        alert("Erro ao processar lista. O proxy pode estar sobrecarregado ou a URL é inválida.");
      } finally {
        setIsLoading(false);
        isProcessingRef.current = false;
      }
    },
    [setActiveView],
  );

  useEffect(() => {
    writeLocalStorageJSON("m3u_lists", m3uLists);
  }, [m3uLists]);

  useEffect(() => {
    writeLocalStorageJSON("custom_categories", customCategories);
  }, [customCategories]);

  useEffect(() => {
    writeLocalStorageJSON("mago_panel_account", panelAccount);
  }, [panelAccount]);

  useEffect(() => {
    let mounted = true;

    const hydratePanelAccount = async () => {
      try {
        const result = (await loadPanelAccountFn({ data: { panelUsername: panelAccount.username } })) as any;

        if (!mounted || !result.success || !result.account) return;

        setPanelAccount(result.account);
        accountHydratedRef.current = true;
      } catch {
        accountHydratedRef.current = true;
      }
    };

    void hydratePanelAccount();
    return () => {
      mounted = false;
    };
  }, [loadPanelAccountFn]);

  useEffect(() => {
    if (!accountHydratedRef.current) return;

    const persistPanelAccount = async () => {
      try {
        await savePanelAccountServerFn({
          data: {
            username: panelAccount.username,
            password: panelAccount.password,
          },
        });
      } catch (error) {
        console.error("Falha ao salvar conta do painel:", error);
      }
    };

    void persistPanelAccount();
  }, [panelAccount, savePanelAccountServerFn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAuthenticated) {
      localStorage.setItem("mago_panel_session", "1");
    } else {
      localStorage.removeItem("mago_panel_session");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    writeLocalStorageValue("mago_category_movies", activeCategories.movies);
    writeLocalStorageValue("mago_category_series", activeCategories.series);
    writeLocalStorageValue("mago_category_live", activeCategories.live);
  }, [activeCategories]);

  useEffect(() => {
    if (activeListUrl) handleProcess(activeListUrl);
  }, [activeListUrl, handleProcess]);

  const movieCategories = useMemo(() => {
    if (!data) return [];
    return data.movies.map((category) => category.name);
  }, [data]);

  const seriesCategories = useMemo(() => {
    if (!data) return [];
    return data.series.map((category) => category.name);
  }, [data]);

  const liveCategories = useMemo(() => {
    if (!data) return [];
    return data.live.map((category) => category.name);
  }, [data]);

  useEffect(() => {
    setActiveCategories((current) => {
      const next = { ...current };
      if (next.movies !== "ALL" && !movieCategories.includes(next.movies)) next.movies = "ALL";
      if (next.series !== "ALL" && !seriesCategories.includes(next.series)) next.series = "ALL";
      if (next.live !== "ALL" && !liveCategories.includes(next.live)) next.live = "ALL";
      return next;
    });
  }, [movieCategories, seriesCategories, liveCategories]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const createCustomCategory = (name: string) => {
    if (!name || selectedIds.size === 0 || !data) return;

    const allItems = [
      ...data.movies.flatMap((c: M3UCategory) => c.items),
      ...data.series.flatMap((group: M3USeriesCategory) =>
        group.series.flatMap((series) => series.seasons.flatMap((season) => season.episodes)),
      ),
      ...data.live.flatMap((c: M3UCategory) => c.items),
    ];

    const selected = allItems.filter((i) => selectedIds.has(i.id));
    setCustomCategories((prev) => ({
      ...prev,
      [name]: [...(prev[name] || []), ...selected],
    }));

    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const deleteCustomCategory = (name: string) => {
    setCustomCategories((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const login = (username: string, password: string) => {
    const normalizedUser = username.trim();
    const normalizedPassword = password;

    if (
      normalizedUser === panelAccount.username.trim() &&
      normalizedPassword === panelAccount.password
    ) {
      setIsAuthenticated(true);
      setActiveView("movies");
      return { success: true, message: "Login realizado com sucesso." };
    }

    return { success: false, message: "Usuário ou senha inválidos." };
  };

  const logout = () => {
    setIsAuthenticated(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSearchQuery("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("mago_panel_session");
    }
  };

  const addM3UList = (name: string, url: string) => {
    if (!name || !url) return;
    setM3uLists((prev) => [...prev, { name, url }]);
  };

  const removeM3UList = (url: string) => {
    setM3uLists((prev) => {
      const next = prev.filter((l) => l.url !== url);
      if (activeListUrl === url) {
        if (next.length > 0 && next[0]) {
          setActiveListUrl(next[0].url);
        } else {
          setActiveListUrl("");
          setData(null);
        }
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    if (!data) return [];

    let source: M3UItem[] = [];
    if (activeView === "movies") {
      const selectedCategory = activeCategories.movies;
      const categories =
        selectedCategory === "ALL"
          ? data.movies
          : data.movies.filter((category) => category.name === selectedCategory);
      source = categories.flatMap((c: M3UCategory) => c.items);
    } else if (activeView === "live") {
      const selectedCategory = activeCategories.live;
      const categories =
        selectedCategory === "ALL"
          ? data.live
          : data.live.filter((category) => category.name === selectedCategory);
      source = categories.flatMap((c: M3UCategory) => c.items);
    } else if (activeView === "series") {
      const selectedCategory = activeCategories.series;
      const categories =
        selectedCategory === "ALL"
          ? data.series
          : data.series.filter((category: M3USeriesCategory) => category.name === selectedCategory);
      source = categories.flatMap((group: M3USeriesCategory) =>
        group.series.flatMap((series) => series.seasons.flatMap((season) => season.episodes)),
      );
    }

    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return source;

    return source.filter((i) => i.name.toLowerCase().includes(query));
  }, [data, activeView, deferredSearchQuery, activeCategories]);

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
    flussonicStreams,
    setFlussonicStreams,
    flussonicMirror,
    setFlussonicMirror,
    handleProcess,
    toggleSelection,
    createCustomCategory,
    deleteCustomCategory,
    addM3UList,
    removeM3UList,
    filteredItems,
    setSelectedIds,
    activeCategories,
    setActiveCategories,
    movieCategories,
    seriesCategories,
    liveCategories,
    panelAccount,
    setPanelAccount,
    isAuthenticated,
    login,
    logout,
  };
}
