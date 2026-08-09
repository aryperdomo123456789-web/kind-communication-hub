import { List } from "lucide-react";
import { FlussonicStreamInfo, M3UItem } from "@/lib/m3u/types";
import { ContentItem } from "./ContentItem";

interface CustomCategoriesViewProps {
  categories: Record<string, M3UItem[]>;
  flussonicStreams: FlussonicStreamInfo[];
  onDeleteCategory: (name: string) => void;
}

export function CustomCategoriesView({
  categories,
  flussonicStreams,
  onDeleteCategory,
}: CustomCategoriesViewProps) {
  const categoryEntries = Object.entries(categories);

  if (categoryEntries.length === 0) {
    return (
      <div className="space-y-8">
        <div className="bg-[#141414] border border-white/5 rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold">Categorias já no Flussonic</h3>
              <p className="text-sm text-neutral-500">
                Essas são as categorias/streams atualmente registradas no servidor.
              </p>
            </div>
            <span className="text-xs text-neutral-500">{flussonicStreams.length} itens</span>
          </div>
          {flussonicStreams.length === 0 ? (
            <div className="text-neutral-600 border border-dashed border-white/10 rounded-xl p-4">
              Conecte o SSH no painel do servidor para carregar as categorias já existentes.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {flussonicStreams.map((stream) => (
                <div
                  key={stream.name}
                  className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4"
                >
                  <div className="font-bold">{stream.name}</div>
                  <div className="text-xs text-neutral-500 mt-1 break-all">
                    {stream.playlistPath
                      ? `playlist:///${stream.playlistPath}`
                      : "Stream pronto no Flussonic"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-[35vh] flex flex-col items-center justify-center text-neutral-600">
          <List size={64} className="mb-4 opacity-20" />
          <p className="text-lg">Nenhuma categoria personalizada criada ainda.</p>
          <p className="text-sm mt-1">Selecione conteúdos nas outras abas para criar as suas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold">Categorias já no Flussonic</h3>
            <p className="text-sm text-neutral-500">
              Essas são as categorias/streams atualmente registradas no servidor.
            </p>
          </div>
          <span className="text-xs text-neutral-500">{flussonicStreams.length} itens</span>
        </div>
        {flussonicStreams.length === 0 ? (
          <div className="text-neutral-600 border border-dashed border-white/10 rounded-xl p-4">
            Conecte o SSH no painel do servidor para carregar as categorias já existentes.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {flussonicStreams.map((stream) => (
              <div key={stream.name} className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                <div className="font-bold">{stream.name}</div>
                <div className="text-xs text-neutral-500 mt-1 break-all">
                  {stream.playlistPath
                    ? `playlist:///${stream.playlistPath}`
                    : "Stream pronto no Flussonic"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
            {items.map((item) => (
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
