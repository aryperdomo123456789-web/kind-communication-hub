import { createFileRoute } from "@tanstack/react-router";
import { useM3U } from "@/hooks/use-m3u";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/m3u/Sidebar";
import { Header } from "@/components/m3u/Header";
import { CategoryRail } from "@/components/m3u/CategoryRail";
import { ContentItem } from "@/components/m3u/ContentItem";
import { SettingsView } from "@/components/m3u/SettingsView";
import { CustomCategoriesView } from "@/components/m3u/CustomCategoriesView";
import { AccountView } from "@/components/m3u/AccountView";
import { LoginView } from "@/components/m3u/LoginView";
import { Search, Menu, X, Server } from "lucide-react";
import { ServerView } from "@/components/m3u/ServerView";
import { FlussonicView } from "@/components/m3u/FlussonicView";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const {
    isLoading,
    data,
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
    selectionMode,
    setSelectionMode,
    selectedIds,
    activeCategories,
    setActiveCategories,
    m3uLists,
    activeListUrl,
    customCategories,
    flussonicStreams,
    setFlussonicStreams,
    flussonicMirror,
    setFlussonicMirror,
    panelAccount,
    setPanelAccount,
    isAuthenticated,
    login,
    logout,
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
  } = useM3U();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(96);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(96);
  }, [activeView, searchQuery, activeListUrl, activeCategories]);

  useEffect(() => {
    const root = mainScrollRef.current;
    const target = loadMoreRef.current;

    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + 96, filteredItems.length));
        }
      },
      {
        root,
        rootMargin: "800px 0px",
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredItems.length, activeView, searchQuery, activeListUrl]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );
  const hasMoreItems = visibleCount < filteredItems.length;
  const categoryOptions = useMemo(() => {
    if (!data) return [];

    if (activeView === "movies") {
      return data.movies.map((category) => ({
        name: category.name,
        count: category.items.length,
      }));
    }

    if (activeView === "series") {
      return data.series.map((group) => ({
        name: group.name,
        count: group.series.reduce(
          (total, series) =>
            total +
            series.seasons.reduce((seasonTotal, season) => seasonTotal + season.episodes.length, 0),
          0,
        ),
      }));
    }

    if (activeView === "live") {
      return data.live.map((category) => ({
        name: category.name,
        count: category.items.length,
      }));
    }

    return [];
  }, [data, activeView]);

  const currentCategory =
    activeView === "movies"
      ? activeCategories.movies
      : activeView === "series"
        ? activeCategories.series
        : activeView === "live"
          ? activeCategories.live
          : "ALL";

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((current) => !current);
  }, []);

  const handleSidebarViewChange = useCallback(
    (view: typeof activeView) => {
      setActiveView(view);
      setIsSidebarOpen(false);
    },
    [setActiveView],
  );

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [setSelectedIds, setSelectionMode]);

  const handleLoadMoreItems = useCallback(() => {
    setVisibleCount((current) => Math.min(current + 96, filteredItems.length));
  }, [filteredItems.length]);

  const handleOpenSettings = useCallback(() => {
    setActiveView("settings");
  }, [setActiveView]);

  const setCurrentCategory = useCallback(
    (category: string) => {
      if (activeView === "movies") {
        setActiveCategories((prev) => ({ ...prev, movies: category }));
      } else if (activeView === "series") {
        setActiveCategories((prev) => ({ ...prev, series: category }));
      } else if (activeView === "live") {
        setActiveCategories((prev) => ({ ...prev, live: category }));
      }
    },
    [activeView, setActiveCategories],
  );

  if (!isAuthenticated) {
    return <LoginView account={panelAccount} onLogin={login} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-600/30 overflow-x-hidden">
      <div className="flex h-screen overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={handleCloseSidebar}
          />
        )}

        <Sidebar
          activeView={activeView}
          setActiveView={handleSidebarViewChange}
          data={data}
          setSearchQuery={setSearchQuery}
          accountName={panelAccount.username}
          onLogout={logout}
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        />

        <div className="flex-1 flex flex-col bg-[#0d0d0d] min-w-0">
          <Header
            activeView={activeView}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isLoading={isLoading}
            selectionMode={selectionMode}
            setSelectionMode={setSelectionMode}
            selectedCount={selectedIds.size}
            onCreateCategory={createCustomCategory}
            onCancelSelection={handleCancelSelection}
            onToggleSidebar={handleToggleSidebar}
          />

          <main
            ref={mainScrollRef}
            className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 scroll-smooth"
          >
            {activeView === "settings" ? (
              <SettingsView
                lists={m3uLists}
                activeUrl={activeListUrl}
                onAdd={addM3UList}
                onActivate={activateM3UList}
                onDisconnect={deactivateActiveM3UList}
                onRemove={removeM3UList}
              />
            ) : activeView === "custom" ? (
               <CustomCategoriesView
                panelUsername={panelAccount.username}
                categories={customCategories}
                flussonicStreams={flussonicStreams}
                onDeleteCategory={deleteCustomCategory}
              />
            ) : activeView === "server" ? (
              <ServerView
                panelUsername={panelAccount.username}
                customCategories={customCategories}
                flussonicStreams={flussonicStreams}
                onFlussonicStreamsChange={setFlussonicStreams}
                flussonicMirror={flussonicMirror}
                onFlussonicMirrorChange={setFlussonicMirror}
              />
            ) : activeView === "flussonic" ? (
              <FlussonicView panelUsername={panelAccount.username} />
            ) : activeView === "account" ? (
              <AccountView account={panelAccount} setAccount={setPanelAccount} />
            ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                {(activeView === "movies" || activeView === "series" || activeView === "live") && (
                  <CategoryRail
                    label={
                      activeView === "movies"
                        ? "Categorias de Filmes"
                        : activeView === "series"
                          ? "Categorias de Séries"
                          : "Categorias Ao Vivo"
                    }
                    items={categoryOptions}
                    activeCategory={currentCategory}
                    onChange={setCurrentCategory}
                  />
                )}

                {selectionMode && (
                  <div className="bg-blue-600/10 border border-blue-600/20 p-3 md:p-4 rounded-xl flex items-center gap-3 text-blue-400 mb-6 md:mb-8">
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                      !
                    </div>
                    <div>
                      <p className="font-bold">Modo de Seleção Ativo</p>
                      <p className="text-xs opacity-80">
                        Clique nos itens para selecionar e depois dê um nome para sua nova categoria
                        no topo.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
                  {visibleItems.map((item) => (
                    <ContentItem
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      selectionMode={selectionMode}
                      onToggle={toggleSelection}
                    />
                  ))}
                </div>
                <div ref={loadMoreRef} className="h-12" />
                {hasMoreItems && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={handleLoadMoreItems}
                      className="px-5 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
                    >
                      Carregar mais
                    </button>
                  </div>
                )}

                {filteredItems.length === 0 && !isLoading && (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-neutral-600 text-center px-4">
                    <Search size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium">
                      {!activeListUrl
                        ? "Nenhuma lista M3U ativa"
                        : searchQuery
                          ? `Nenhum resultado para "${searchQuery}"`
                          : "Esta lista não contém itens para esta categoria"}
                    </p>
                    {!activeListUrl && (
                      <button
                        onClick={handleOpenSettings}
                        className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all"
                      >
                        Configurar Listas
                      </button>
                    )}
                  </div>
                )}
                {isLoading && filteredItems.length > 0 && (
                  <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
                    Processando itens da lista...
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
