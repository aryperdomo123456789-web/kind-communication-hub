import { createFileRoute } from "@tanstack/react-router";
import { useM3U } from "@/hooks/use-m3u";
import { Sidebar } from "@/components/m3u/Sidebar";
import { Header } from "@/components/m3u/Header";
import { ContentItem } from "@/components/m3u/ContentItem";
import { SettingsView } from "@/components/m3u/SettingsView";
import { CustomCategoriesView } from "@/components/m3u/CustomCategoriesView";
import { Search } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-600/30">
      <div className="flex h-screen overflow-hidden">
        <Sidebar 
          activeView={activeView} 
          setActiveView={setActiveView} 
          data={data}
          setSearchQuery={setSearchQuery}
        />

        <div className="flex-1 flex flex-col bg-[#0d0d0d]">
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
          />

          <main className="flex-1 overflow-y-auto p-8">
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
