# Guia de Implantação Especialista: M3U Separator PRO no aaPanel

Este guia detalha o processo de deploy do sistema no servidor `38.190.176.171` dentro do diretório `/www/wwwroot/flutes.vr766.com`.

## 🏗️ Preparação do Ambiente no aaPanel

### 1. Requisitos do Sistema
- **Node.js:** Versão 20 ou superior (Recomendado usar o Node.js Version Manager no aaPanel).
- **Gerenciador de Processos:** PM2 (instalado via App Store do aaPanel).
- **Site:** Domínio `flutes.vr766.com` criado no menu "Website".

### 2. Configuração do Node.js
No painel do aaPanel:
1. Vá em **App Store** > procure por **Node.js Version Manager**.
2. Instale a versão **v20.x** ou mais recente.
3. Clique em "Registry" e selecione "official" ou "taobao" para garantir downloads rápidos.

---

## 🚀 Passo a Passo da Instalação

### 1. Preparação dos Arquivos
Acesse o terminal do servidor ou use o Gerenciador de Arquivos do aaPanel:
```bash
cd /www/wwwroot/flutes.vr766.com
# Limpe o diretório se necessário
# rm -rf * 
```

### 2. Build do Projeto (Local ou Servidor)
Como este projeto utiliza **TanStack Start**, ele precisa ser compilado para produção:

```bash
# Instalar dependências
npm install

# Gerar o build de produção
npm run build
```

### 3. Configuração do PM2 (Para manter o app online)
Crie um arquivo `ecosystem.config.cjs` na raiz do projeto:
```javascript
module.exports = {
  apps: [{
    name: "m3u-separator",
    script: "npm",
    args: "run start",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
}
```
Inicie o processo:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 🛠️ Configuração de Proxy Reverso (Nginx)

Para que o domínio `flutes.vr766.com` aponte para o app rodando na porta 3000:

1. No aaPanel, vá em **Website** > Clique nas configurações de `flutes.vr766.com`.
2. Vá na aba **Reverse Proxy** > **Add reverse proxy**.
3. **Proxy name:** `M3U_APP`
4. **Target URL:** `http://127.0.0.1:3000`
5. Clique em **Submit**.

---

## 🔒 Ajustes de Segurança e Permissões

### 1. SSH Bridge
O sistema utiliza funções de servidor para conectar via SSH a outros IPs. Certifique-se de que o firewall do aaPanel (Security tab) permite conexões de saída na porta 22 (SSH) e porta 8080 (Bridge).

### 2. Permissões de Pasta
Garanta que o usuário `www` tenha permissão na pasta `.docs/` para que o sistema possa ler a documentação local:
```bash
chown -R www:www /www/wwwroot/flutes.vr766.com
chmod -R 755 /www/wwwroot/flutes.vr766.com
```

---

## 📡 Fluxo de Funcionamento Pós-Deploy

1. **Acesso:** Acesse `https://flutes.vr766.com`.
2. **Configuração:** Vá em "Listas M3U" e adicione sua URL principal.
3. **Flussonic:** Na aba "Conectar Servidor", utilize as credenciais root do seu servidor Flussonic para ativar a automação de canais 24h.
4. **Sincronização:** Crie suas categorias em "Minhas Categorias" e use o botão "Sincronizar Flussonic" para publicar os canais automaticamente no servidor de destino.

---

## 🆘 Troubleshooting no aaPanel
- **Erro 502 Bad Gateway:** Verifique se o PM2 está rodando (`pm2 status`).
- **Erro de CORS:** O proxy em `src/routes/api/public/m3u.ts` já resolve isso, mas garanta que o Nginx não esteja bloqueando headers personalizados.
- **Log de Erros:** Verifique os logs do PM2 para depuração em tempo real:
  ```bash
  pm2 logs m3u-separator
  ```
