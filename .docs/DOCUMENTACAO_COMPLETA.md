# M3U Separator PRO & Flussonic Manager

Este projeto é uma solução completa para gestão de listas M3U, criação de categorias personalizadas e automação de servidores Flussonic para canais 24h.

## 🚀 Capacidade Total e Funcionalidades

### 1. Processamento Inteligente de M3U
O motor de separação utiliza regex avançado e análise de padrões de URL para classificar automaticamente milhares de linhas:
- **Filmes:** Identificados pelo padrão `/movie/` no link de reprodução.
- **Séries:** Identificados pelo padrão `/series/` com extração automática de Temporada (S) e Episódio (E).
- **Canais ao Vivo:** Identificados por `/live/` ou extensões `.ts`.
- **Agrupamento:** Organização automática por `group-title` (Categorias).

### 2. Dashboard XCIPTV Style
- Interface moderna, escura e 100% responsiva (Mobile-First).
- Sidebar para navegação rápida entre categorias e tipos de conteúdo.
- Pesquisa global em tempo real por nome do conteúdo.
- Contagem dinâmica de itens em cada categoria.

### 3. Gestão de Listas Personalizadas
- Suporte a múltiplas listas M3U.
- Persistência local (LocalStorage) das configurações.
- **Modo de Seleção:** Permite selecionar múltiplos itens (filmes, episódios ou canais) para criar "Minhas Categorias".
- Edição e exclusão de categorias personalizadas criadas pelo usuário.

### 4. Integração com Servidor via SSH
- Conexão segura com servidores remotos via SSH.
- Instalação de "Bridge" local para execução de comandos.
- Download de vídeos diretamente no servidor usando `wget`.
- Gerenciamento de processos para evitar conflitos de porta.

### 5. Automação Flussonic (Canais 24h)
Transforme sua lista M3U em uma grade de canais 24h no Flussonic de forma automática:
- **Sincronização em Tempo Real:** Visualiza categorias existentes no Flussonic.
- **Criação de Canais:** Gera automaticamente arquivos `playlist.txt` no servidor.
- **Configuração Automática:** Edita o `flussonic.conf` e recarrega o serviço via SSH.
- **Categorias Automáticas:** Sincroniza suas categorias personalizadas criadas no app diretamente para o Flussonic.

---

## 📂 Estrutura de Documentação Técnica (.docs/)

O sistema inclui guias detalhados sobre a lógica de configuração do Flussonic:
- `canal-24h-flussonic.md`: Como configurar streams 24h.
- `canal-por-categoria-flussonic.md`: Organização de pastas e playlists.
- `canal-por-categoria-flussonic-exemplos.md`: Exemplos de sintaxe para o arquivo de configuração.

## 🛠️ Tecnologias Utilizadas
- **Frontend:** TanStack Start (React 19), Tailwind CSS v4, Lucide React.
- **Backend/Server Functions:** Node.js, SSH2, Zod.
- **State Management:** Hooks customizados com persistência local.
