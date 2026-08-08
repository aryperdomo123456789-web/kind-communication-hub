import { List } from "lucide-react";
import { M3UItem } from "@/lib/m3u/types";
import { ContentItem } from "./ContentItem";

interface CustomCategoriesViewProps {
  categories: Record<string, M3UItem[]>;
  onDeleteCategory: (name: string) => void;
}

export function CustomCategoriesView({ categories, onDeleteCategory }: CustomCategoriesViewProps) {
  const categoryEntries = Object.entries(categories);

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
    <div className="space-y-8 md:space-y-12 animate-in fade-in">
      {categoryEntries.map(([name, items]) => (
        <div key={name} className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3 md:pb-4">
            <h3 className="text-xl md:text-2xl font-bold flex items-center gap-2 md:gap-3">
              <div className="w-2 h-8 bg-blue-600 rounded-full" /> {name}
            </h3>
            <button 
              onClick={() => onDeleteCategory(name)}
              className="text-xs text-red-500 hover:underline"
            >
              Excluir Categoria
            </button>
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
