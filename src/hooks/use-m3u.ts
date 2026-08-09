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
import {
  loadPanelAccount,
  savePanelAccountFn,
  loadSavedCustomCategories,
  saveSavedCustomCategories,
  loadSavedM3UListsFn,
  saveM3UListFn,
  activateM3UListFn,
  deactivateM3UListFn,
  deleteSavedM3UListFn,
} from "@/lib/ssh.functions";
import { readLocalStorageJSON, writeLocalStorageJSON, writeLocalStorageValue } from "@/lib/storage";
import type { SavedM3UListRecord } from "@/lib/flussonic-connection-store";

export type ViewType = "movies" | "series" | "live" | "custom" | "settings" | "server" | "account" | "flussonic";
export type ContentView = "movies" | "series" | "live";

const LEGACY_DEFAULT_M3U_URL =
  "http://servicedovod.shop:80/get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls";

const DEFAULT_PANEL_ACCOUNT: PanelAccount = {
  username: "mago@dono.com",
  password: "12345678",
};

function buildStableM3UItemId(item: Pick<M3UItem, "name" | "url" | "group" | "rawName">, index: number) {
  const seed = `${item.url}|${item.name}|${item.group}|${item.rawName}|${index}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return `m3u_${Math.abs(hash).toString(36)}_${index}`;
}

function normalizeM3UItems(items: M3UItem[]): M3UItem[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const currentId = item.id?.trim();
    if (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      return item;
    }

    const nextId = buildStableM3UItemId(item, index);
    seen.add(nextId);
    return { ...item, id: nextId };
  });
}

function normalizeCustomCategories(categories: Record<string, M3UItem[]>): Record<string, M3UItem[]> {
  return Object.fromEntries(
    Object.entries(categories || {}).map(([name, items]) => [name, normalizeM3UItems(items || [])]),
  );
}

function resolveActiveM3UUrl(
  lists: SavedM3UListRecord[],
  activeUrl?: string | null,
): string {
  const normalizedActiveUrl = (activeUrl || "").trim();
  if (normalizedActiveUrl) return normalizedActiveUrl;

  const activeList = lists.find((list) => list.isActive);
  return activeList?.url?.trim() || "";
}

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
  const loadCustomCategoriesFn = useServerFn(loadSavedCustomCategories);
  const saveCustomCategoriesFn = useServerFn(saveSavedCustomCategories);
  const accountHydratedRef = useRef(false);
  const customCategoriesHydratedRef = useRef(false);
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

  // Listas M3U persistidas no servidor
  const [m3uLists, setM3uLists] = useState<SavedM3UListRecord[]>(() => {
    if (typeof window === "undefined") return [];
    return readLocalStorageJSON<SavedM3UListRecord[]>("m3u_lists", []);
  });
  const [activeListUrl, setActiveListUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("active_m3u_url") || "";
    return stored;
  });
  const [m3uListsHydrated, setM3uListsHydrated] = useState(false);

  // Custom Categories Persistence
  const [customCategories, setCustomCategories] = useState<Record<string, M3UItem[]>>(() => {
    if (typeof window === "undefined") return {};
    return readLocalStorageJSON("custom_categories", {});
  });

  const [flussonicStreams, setFlussonicStreams] = useState<FlussonicStreamInfo[]>([]);
  const [flussonicMirror, setFlussonicMirror] = useState<FlussonicMirrorSnapshot | null>(null);
  const isProcessingRef = useRef(false);
  const lastProcessedUrlRef = useRef("");

  const handleProcess = useCallback(
    async (url: string, options?: { silent?: boolean }) => {
      if (!url || isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsLoading(true);
      try {
        const parsed = await parseM3U(url, { silent: options?.silent });

        if (
          parsed &&
          (parsed.movies.length > 0 || parsed.series.length > 0 || parsed.live.length > 0)
        ) {
          setData(parsed);
          setActiveListUrl(url);
          lastProcessedUrlRef.current = url;
          setActiveView((current) => (current === "settings" ? "movies" : current));
        } else {
          if (!options?.silent) {
            console.error("M3U vazia ou formato inválido detectado na auditoria.");
            alert(
              "A lista M3U parece estar vazia ou o servidor não respondeu corretamente. Verifique a URL.",
            );
          }
        }
      } catch (error) {
        if (!options?.silent) {
          console.error("Erro crítico no motor de processamento:", error);
          alert("Erro ao processar lista. O proxy pode estar sobrecarregado ou a URL é inválida.");
        }
      } finally {
        setIsLoading(false);
        isProcessingRef.current = false;
      }
    },
    [setActiveView],
  );

  useEffect(() => {
    if (!customCategoriesHydratedRef.current) return;

    const persistCustomCategories = async () => {
      try {
        await saveCustomCategoriesFn({
          data: {
            panelUsername: panelAccount.username,
            categories: customCategories,
          },
        });
      } catch (error) {
        console.error("Falha ao salvar categorias personalizadas:", error);
      } finally {
        writeLocalStorageJSON("custom_categories", customCategories);
      }
    };

    void persistCustomCategories();
  }, [customCategories, panelAccount.username, saveCustomCategoriesFn]);

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
    let mounted = true;

    const hydrateCustomCategories = async () => {
      try {
        const result = (await loadCustomCategoriesFn({
          data: { panelUsername: panelAccount.username },
        })) as {
          success: boolean;
          categories?: Record<string, M3UItem[]>;
        };

        if (!mounted) return;

        if (result.success && result.categories && Object.keys(result.categories).length > 0) {
          setCustomCategories(normalizeCustomCategories(result.categories));
        } else {
          const cachedCategories = readLocalStorageJSON<Record<string, M3UItem[]>>(
            "custom_categories",
            {},
          );
          if (Object.keys(cachedCategories).length > 0) {
            setCustomCategories(normalizeCustomCategories(cachedCategories));
          }
        }
      } catch {
        // Mantém o cache local caso o banco não responda.
      } finally {
        if (mounted) {
          customCategoriesHydratedRef.current = true;
        }
      }
    };

    void hydrateCustomCategories();
    return () => {
      mounted = false;
    };
  }, [loadCustomCategoriesFn, panelAccount.username]);

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
    writeLocalStorageJSON("m3u_lists", m3uLists);
  }, [m3uLists]);

  useEffect(() => {
    writeLocalStorageValue("active_m3u_url", activeListUrl);
  }, [activeListUrl]);

  useEffect(() => {
    if (!activeListUrl) return;
    if (lastProcessedUrlRef.current === activeListUrl) return;
    void handleProcess(activeListUrl);
  }, [activeListUrl, handleProcess]);

  useEffect(() => {
    let mounted = true;

    const migrateLegacyLists = async () => {
      if (typeof window === "undefined") {
        setM3uListsHydrated(true);
        return;
      }

      try {
        const result = (await loadSavedM3UListsFn({
          data: { panelUsername: panelAccount.username },
        })) as {
          success: boolean;
          lists?: SavedM3UListRecord[];
          activeList?: SavedM3UListRecord | null;
        };

        if (!mounted) return;

        if (result.success) {
          const serverLists = result.lists ?? [];
          const activeUrl = resolveActiveM3UUrl(serverLists, result.activeList?.url || "");

          if (serverLists.length > 0) {
            setM3uLists(serverLists);
            setActiveListUrl(activeUrl);
            writeLocalStorageJSON("m3u_lists", serverLists);
            writeLocalStorageValue("active_m3u_url", activeUrl);
            setM3uListsHydrated(true);
            return;
          }

          const legacyLists = readLocalStorageJSON<{ name: string; url: string }[]>("m3u_lists", [])
            .filter((list) => list.url);
          const legacyActiveUrl = localStorage.getItem("active_m3u_url") || "";

          if (legacyLists.length > 0) {
            for (const list of legacyLists) {
              await saveM3UListFn({
                data: {
                  panelUsername: panelAccount.username,
                  name: list.name,
                  url: list.url,
                },
              });
            }

            if (legacyActiveUrl) {
              await activateM3UListFn({
                data: {
                  panelUsername: panelAccount.username,
                  url: legacyActiveUrl,
                },
              });
            }

            const migrated = (await loadSavedM3UListsFn({
              data: { panelUsername: panelAccount.username },
            })) as {
              success: boolean;
              lists?: SavedM3UListRecord[];
              activeList?: SavedM3UListRecord | null;
            };

            if (!mounted) return;

            const migratedLists = migrated.lists ?? [];
            const migratedActiveUrl = resolveActiveM3UUrl(migratedLists, migrated.activeList?.url || "");
            setM3uLists(migratedLists);
            setActiveListUrl(migratedActiveUrl);
            writeLocalStorageJSON("m3u_lists", migratedLists);
            writeLocalStorageValue("active_m3u_url", migratedActiveUrl);
            setM3uListsHydrated(true);
            return;
          }

          const cachedLists = readLocalStorageJSON<SavedM3UListRecord[]>("m3u_lists", []);
          const cachedActiveUrl = resolveActiveM3UUrl(cachedLists, localStorage.getItem("active_m3u_url") || "");
          setM3uLists(cachedLists);
          setActiveListUrl(cachedActiveUrl);
        }
      } catch (error) {
        console.error("Falha ao carregar listas M3U persistidas:", error);
        const cachedLists = readLocalStorageJSON<SavedM3UListRecord[]>("m3u_lists", []);
        const fallbackActiveUrl = resolveActiveM3UUrl(cachedLists, localStorage.getItem("active_m3u_url") || "");
        setM3uLists(cachedLists.map((list) => ({ ...list, isActive: list.url === fallbackActiveUrl })));
        setActiveListUrl(fallbackActiveUrl);
      } finally {
        if (mounted) {
          setM3uListsHydrated(true);
        }
      }
    };

    void migrateLegacyLists();
    return () => {
      mounted = false;
    };
  }, [panelAccount.username]);

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
      [name]: normalizeM3UItems([...(prev[name] || []), ...selected]),
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

  const syncM3UListState = useCallback((lists: SavedM3UListRecord[], activeUrl: string) => {
    const resolvedActiveUrl = resolveActiveM3UUrl(lists, activeUrl);
    setM3uLists(lists);
    setActiveListUrl(resolvedActiveUrl);
    writeLocalStorageJSON("m3u_lists", lists);
    writeLocalStorageValue("active_m3u_url", resolvedActiveUrl);
    if (!resolvedActiveUrl) {
      lastProcessedUrlRef.current = "";
      setData(null);
    }
  }, []);

  const addM3UList = useCallback(
    async (name: string, url: string) => {
      if (!name || !url) return;
      const result = (await saveM3UListFn({
        data: {
          panelUsername: panelAccount.username,
          name,
          url,
        },
      })) as {
        success: boolean;
        lists?: SavedM3UListRecord[];
        activeList?: SavedM3UListRecord | null;
      };

      if (result.success) {
        syncM3UListState(result.lists ?? [], result.activeList?.url || "");
      }
    },
    [panelAccount.username, syncM3UListState],
  );

  const activateM3UList = useCallback(
    async (url: string) => {
      if (!url) return;
      const result = (await activateM3UListFn({
        data: {
          panelUsername: panelAccount.username,
          url,
        },
      })) as {
        success: boolean;
        lists?: SavedM3UListRecord[];
        activeList?: SavedM3UListRecord | null;
      };

      if (result.success && result.activeList) {
        lastProcessedUrlRef.current = "";
        syncM3UListState(result.lists ?? [], result.activeList.url);
        await handleProcess(result.activeList.url);
      }
    },
    [handleProcess, panelAccount.username, syncM3UListState],
  );

  const deactivateActiveM3UList = useCallback(async () => {
    const result = (await deactivateM3UListFn({
      data: { panelUsername: panelAccount.username },
    })) as {
      success: boolean;
      lists?: SavedM3UListRecord[];
      activeList?: SavedM3UListRecord | null;
    };

    if (result.success) {
      lastProcessedUrlRef.current = "";
      syncM3UListState(result.lists ?? [], "");
    }
  }, [panelAccount.username, syncM3UListState]);

  const removeM3UList = useCallback(
    async (url: string) => {
      if (!url) return;
      const wasActive = activeListUrl === url;
      const result = (await deleteSavedM3UListFn({
        data: {
          panelUsername: panelAccount.username,
          url,
        },
      })) as {
        success: boolean;
        lists?: SavedM3UListRecord[];
        activeList?: SavedM3UListRecord | null;
      };

      if (result.success) {
        lastProcessedUrlRef.current = "";
        const nextActiveUrl = result.activeList?.url || "";
        syncM3UListState(result.lists ?? [], nextActiveUrl);
        if (wasActive && !nextActiveUrl) {
          setData(null);
        }
      }
    },
    [activeListUrl, panelAccount.username, syncM3UListState],
  );

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
    activateM3UList,
    deactivateActiveM3UList,
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
    m3uListsHydrated,
  };
}
