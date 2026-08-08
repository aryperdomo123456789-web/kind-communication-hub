import { createFileRoute } from "@tanstack/react-router";
import { useM3U } from "@/hooks/use-m3u";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/m3u/Sidebar";
import { Header } from "@/components/m3u/Header";
import { ContentItem } from "@/components/m3u/ContentItem";
import { SettingsView } from "@/components/m3u/SettingsView";
import { CustomCategoriesView } from "@/components/m3u/CustomCategoriesView";
import { Search, Menu, X } from "lucide-react";
import { useState } from "react";

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
  } = useM3U();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-600/30 overflow-x-hidden">
      <div className="flex h-screen overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <Sidebar 
          activeView={activeView} 
          setActiveView={(view) => {
            setActiveView(view);
            setIsSidebarOpen(false);
          }} 
          data={data}
          setSearchQuery={setSearchQuery}
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
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
            onCancelSelection={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />

          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {activeView === "settings" ? (
              <SettingsView 
                lists={m3uLists}
                activeUrl={activeListUrl}
                onAdd={addM3UList}
                onRemove={removeM3UList}
                onProcess={handleProcess}
              />
            ) : activeView === "custom" ? (
              <CustomCategoriesView 
                categories={customCategories} 
                onDeleteCategory={deleteCustomCategory} 
              />
            ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                  {selectionMode && (
                    <div className="bg-blue-600/10 border border-blue-600/20 p-3 md:p-4 rounded-xl flex items-center gap-3 text-blue-400 mb-6 md:mb-8">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">!</div>
                    <div>
                      <p className="font-bold">Modo de Seleção Ativo</p>
                      <p className="text-xs opacity-80">Clique nos itens para selecionar e depois dê um nome para sua nova categoria no topo.</p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
                  {getFilteredItems().map(item => (
                    <ContentItem 
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      selectionMode={selectionMode}
                      onToggle={toggleSelection}
                    />
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
