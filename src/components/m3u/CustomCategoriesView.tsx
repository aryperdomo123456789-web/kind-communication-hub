import { List, Tv, Loader2, X } from "lucide-react";
import { M3UItem } from "@/lib/m3u/types";
import { ContentItem } from "./ContentItem";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFlussonicCategory, createFlussonicChannel } from "@/lib/flussonic.functions";

interface CustomCategoriesViewProps {
  categories: Record<string, M3UItem[]>;
  onDeleteCategory: (name: string) => void;
}

export function CustomCategoriesView({ categories, onDeleteCategory }: CustomCategoriesViewProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const createCatFn = useServerFn(createFlussonicCategory);
  const createChannelFn = useServerFn(createFlussonicChannel);


  const categoryEntries = Object.entries(categories);

  const handlePushToFlussonic = async (name: string, items: M3UItem[]) => {
    setLoadingStates(prev => ({ ...prev, [name]: true }));
    try {
      // 1. Criar categoria no Flussonic
      const catRes = await createCatFn({ data: { name } });
      
      // 2. Criar cada canal (item) dentro dessa categoria
      // No contexto do Flussonic, cada filme/série selecionado vira um "canal" ou item de playlist
      for (const item of items) {
        const channelName = item.name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        await createChannelFn({
          data: {
            name: channelName,
            category: name,
            videos: [item.url] // Aqui passamos a URL da m3u. 
            // Nota: A doc diz que baixar é melhor, mas o fluxo solicitado é preparar para o Flussonic.
          }
        });
      }
      
      alert(`Categoria "${name}" e seus ${items.length} itens foram sincronizados com o Flussonic!`);
    } catch (error) {
      console.error(error);
      alert("Erro ao sincronizar com Flussonic.");
    } finally {
      setLoadingStates(prev => ({ ...prev, [name]: false }));
    }
  };

  if (categoryEntries.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-neutral-600">
        <List size={64} className="mb-4 opacity-20"/>
        <p className="text-lg">Nenhuma categoria personalizada criada ainda.</p>
        <p className="text-sm mt-1">Selecione conteúdos nas outras abas para criar as suas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in pb-20">
      {categoryEntries.map(([name, items]) => (
        <div key={name} className="space-y-4 md:space-y-6 bg-black/20 p-4 md:p-6 rounded-2xl border border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 bg-blue-600 rounded-full" />
              <div>
                <h3 className="text-xl md:text-2xl font-bold">{name}</h3>
                <p className="text-xs text-neutral-500">{items.length} itens preparados</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handlePushToFlussonic(name, items)}
                disabled={loadingStates[name]}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-800 rounded-lg text-xs font-bold transition-all shadow-lg shadow-orange-600/20"
              >
                {loadingStates[name] ? <Loader2 size={14} className="animate-spin" /> : <Tv size={14} />}
                Sincronizar Flussonic
              </button>
              <button 
                onClick={() => onDeleteCategory(name)}
                className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
                title="Excluir Categoria"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
            {items.map(item => (
              <ContentItem 
                key={item.id} 
                item={item} 
                isSelected={false} 
                selectionMode={false} 
                onToggle={() => {}} 
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

