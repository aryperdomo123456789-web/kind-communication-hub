import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { parseM3U, M3UParsed, M3UItem } from "@/lib/m3u";
import { useEffect } from "react";
import { Play, Film, Tv, ChevronLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<M3UParsed | null>(null);
  const [m3uText, setM3uText] = useState("http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls");
  const [activeView, setActiveView] = useState<"movies" | "series" | "live">("movies");
  
  // Navigation State
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

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

  const resetNav = () => {
    setSelectedCat(null);
    setSelectedSeries(null);
    setSelectedSeason(null);
  };

  useEffect(() => {
    handleProcess();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar Navigation - Estilo XCIPTV */}
      <div className="flex h-screen overflow-hidden">
        <div className="w-20 md:w-64 bg-[#141414] border-r border-neutral-800 flex flex-col items-center py-8 gap-8">
          <div className="text-blue-500 font-bold text-2xl hidden md:block px-4">XCIPTV PRO</div>
          <div className="text-blue-500 font-bold text-xl md:hidden">XC</div>
          
          <nav className="flex flex-col w-full gap-2 px-2">
            <button 
              onClick={() => {setActiveView("movies"); resetNav();}} 
              className={`flex items-center gap-3 p-4 rounded-xl transition-all ${activeView === "movies" ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-neutral-400 hover:bg-neutral-800"}`}
            >
              <Film size={24} />
              <span className="hidden md:inline font-medium">Filmes</span>
            </button>
            <button 
              onClick={() => {setActiveView("series"); resetNav();}} 
              className={`flex items-center gap-3 p-4 rounded-xl transition-all ${activeView === "series" ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-neutral-400 hover:bg-neutral-800"}`}
            >
              <Tv size={24} />
              <span className="hidden md:inline font-medium">Séries</span>
            </button>
            <button 
              onClick={() => {setActiveView("live"); resetNav();}} 
              className={`flex items-center gap-3 p-4 rounded-xl transition-all ${activeView === "live" ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-neutral-400 hover:bg-neutral-800"}`}
            >
              <Play size={24} />
              <span className="hidden md:inline font-medium">Ao Vivo</span>
            </button>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 bg-[#141414] border-b border-neutral-800 flex items-center justify-between px-8">
            <div className="flex items-center gap-4">
              {selectedCat || selectedSeries ? (
                <button 
                  onClick={() => {
                    if (selectedSeason) setSelectedSeason(null);
                    else if (selectedSeries) setSelectedSeries(null);
                    else setSelectedCat(null);
                  }}
                  className="p-2 hover:bg-neutral-800 rounded-full text-blue-400 transition-colors"
                >
                  <ChevronLeft size={24} />
                </button>
              ) : null}
              <h2 className="text-xl font-semibold">
                {activeView === "movies" && "Filmes"}
                {activeView === "series" && "Séries"}
                {activeView === "live" && "Canais Ao Vivo"}
                {selectedCat && ` > ${selectedCat}`}
                {selectedSeries && ` > ${selectedSeries}`}
                {selectedSeason && ` > Temporada ${selectedSeason}`}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {isLoading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>}
              <button 
                onClick={handleProcess}
                className="text-sm bg-blue-600/10 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all"
              >
                Recarregar Lista
              </button>
            </div>
          </header>

          {/* Grid de Conteúdo */}
          <main className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]">
            {isLoading && !data && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-neutral-500">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p className="text-lg">Carregando conteúdos...</p>
              </div>
            )}

            {!isLoading && data && (
              <>
                {/* Categorias (Movies / Live) */}
                {(activeView === "movies" || activeView === "live") && !selectedCat && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {(activeView === "movies" ? data.movies : data.live).map((cat, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setSelectedCat(cat.name)}
                        className="group relative bg-[#1a1a1a] p-6 rounded-2xl border border-neutral-800 hover:border-blue-500/50 hover:bg-blue-600/5 transition-all text-left"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            {activeView === "movies" ? <Film size={20} /> : <Play size={20} />}
                          </div>
                          <span className="text-xs font-bold text-neutral-500 bg-black/50 px-2 py-1 rounded-md">{cat.items.length} ITENS</span>
                        </div>
                        <h3 className="font-bold text-lg group-hover:text-blue-400 transition-colors truncate">{cat.name}</h3>
                        <p className="text-sm text-neutral-500 mt-1 truncate">Explorar categoria</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Itens (Movies / Live) */}
                {(activeView === "movies" || activeView === "live") && selectedCat && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                    {(activeView === "movies" ? data.movies : data.live)
                      .find(c => c.name === selectedCat)?.items.map((item, idx) => (
                      <div key={idx} className="group cursor-pointer">
                        <div className="relative aspect-[2/3] bg-[#1a1a1a] rounded-xl overflow-hidden border border-neutral-800 group-hover:border-blue-500 transition-all">
                          {item.logo ? (
                            <img src={item.logo} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-700">
                              {activeView === "movies" ? <Film size={48} /> : <Play size={48} />}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                            >
                              <Play fill="white" size={20} className="ml-1" />
                            </a>
                          </div>
                        </div>
                        <h4 className="mt-3 text-sm font-medium text-neutral-300 group-hover:text-white truncate px-1">{item.name}</h4>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista de Séries */}
                {activeView === "series" && !selectedSeries && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                    {data.series.map((series, idx) => (
                      <div key={idx} className="group cursor-pointer" onClick={() => setSelectedSeries(series.name)}>
                        <div className="relative aspect-[2/3] bg-[#1a1a1a] rounded-xl overflow-hidden border border-neutral-800 group-hover:border-blue-500 transition-all">
                          {series.seasons[0]?.episodes[0]?.logo ? (
                            <img src={series.seasons[0].episodes[0].logo} alt={series.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-700">
                              <Tv size={48} />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 bg-blue-600 text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">
                            {series.seasons.length} TEMPS
                          </div>
                        </div>
                        <h4 className="mt-3 text-sm font-medium text-neutral-300 group-hover:text-white truncate px-1">{series.name}</h4>
                      </div>
                    ))}
                  </div>
                )}

                {/* Temporadas de uma Série */}
                {activeView === "series" && selectedSeries && !selectedSeason && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data.series.find(s => s.name === selectedSeries)?.seasons.map((season, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setSelectedSeason(season.number)}
                        className="group bg-[#1a1a1a] p-6 rounded-2xl border border-neutral-800 hover:border-blue-500/50 hover:bg-blue-600/5 transition-all text-left flex items-center justify-between"
                      >
                        <div>
                          <h3 className="font-bold text-lg">Temporada {season.number}</h3>
                          <p className="text-sm text-neutral-500 mt-1">{season.episodes.length} Episódios</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-neutral-800 group-hover:bg-blue-600 flex items-center justify-center transition-all">
                          <ArrowRight size={18} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Episódios de uma Temporada */}
                {activeView === "series" && selectedSeries && selectedSeason && (
                  <div className="flex flex-col gap-2">
                    {data.series.find(s => s.name === selectedSeries)
                      ?.seasons.find(s => s.number === selectedSeason)
                      ?.episodes.map((ep, idx) => (
                      <div key={idx} className="group bg-[#1a1a1a] p-4 rounded-xl border border-neutral-800 flex items-center gap-4 hover:border-neutral-600 transition-all">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm">
                          {ep.episode}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-neutral-200 truncate">{ep.name}</h4>
                          <p className="text-xs text-neutral-500 mt-0.5">Disponível em HLS / Full HD</p>
                        </div>
                        <a 
                          href={ep.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition-colors"
                        >
                          Assistir
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
