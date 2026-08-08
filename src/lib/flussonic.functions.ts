import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Client } from "ssh2";


export interface FlussonicResponse {
  success: boolean;
  message: string;
}

const SERVER_CONFIG = {
  host: "173.208.244.141",
  port: 22,
  username: "root",
  password: "mago3333123", // Já fornecido pelo usuário em mensagens anteriores
};

export const listFlussonicCategories = createServerFn({ method: "GET" })
  .handler(async (): Promise<{success: boolean, categories: string[]}> => {
    const cmd = `ls -F /opt/flussonic/priv/ | grep / | sed 's/\\///'`;
    
    return new Promise((resolve) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) resolve({ success: false, categories: [] });
          let data = '';
          stream.on('data', (chunk: Buffer) => { data += chunk; });
          stream.on('close', () => {
            conn.end();
            const categories = data.split('\n').filter(Boolean);
            resolve({ success: true, categories });
          });
        });
      }).on('error', () => resolve({ success: false, categories: [] }))
        .connect(SERVER_CONFIG);
    });
  });

export const createFlussonicCategory = createServerFn({ method: "POST" })


export const createFlussonicChannel = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    name: z.string(),
    category: z.string().optional(),
    videos: z.array(z.string())
  }).parse(data))
  .handler(async ({ data }): Promise<FlussonicResponse> => {
    const catSlug = data.category ? data.category.toLowerCase().replace(/\s+/g, '-') : "";
    const channelSlug = data.name.toLowerCase().replace(/\s+/g, '-');
    const basePath = catSlug ? `/opt/flussonic/priv/${catSlug}/${channelSlug}` : `/opt/flussonic/priv/${channelSlug}`;
    const playlistPath = `${basePath}/playlist.txt`;
    
    // Preparar conteúdo da playlist
    const playlistContent = data.videos.map(v => {
      const cleanV = v.trim();
      return catSlug ? `vod/${catSlug}/${channelSlug}/${cleanV}` : `vod/${channelSlug}/${cleanV}`;
    }).join('\n');

    const streamName = catSlug ? `${catSlug}-${channelSlug}` : channelSlug;
    
    // Comandos para criar pasta, playlist e atualizar flussonic.conf
    const cmd = `
mkdir -p ${basePath}
cat > ${playlistPath} <<EOF
${playlistContent}
EOF
if ! grep -q "stream ${streamName}" /etc/flussonic/flussonic.conf; then
  cat >> /etc/flussonic/flussonic.conf <<EOF

stream ${streamName} {
  input playlist://${playlistPath};
}
EOF
fi
service flussonic reload
`;

    return new Promise((resolve) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) resolve({ success: false, message: "Erro SSH: " + err.message });
          stream.on('close', () => {
            conn.end();
            resolve({ success: true, message: `Canal "${streamName}" ativo e playlist configurada!` });
          });
        });
      }).on('error', (err) => resolve({ success: false, message: "Conexão falhou: " + err.message }))
        .connect(SERVER_CONFIG);
    });
  });
