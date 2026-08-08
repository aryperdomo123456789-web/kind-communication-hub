import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Client } from "ssh2";

const sshConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(22),
  username: z.string(),
  password: z.string(),
});

export const validateSshConnection = createServerFn({ method: "POST" })
  .inputValidator((data) => sshConfigSchema.parse(data))
  .handler(async ({ data }) => {
    return new Promise((resolve) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.end();
        resolve({ success: true, message: "Conexão SSH estabelecida com sucesso!" });
      }).on('error', (err) => {
        resolve({ success: false, message: err.message });
      }).connect({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        readyTimeout: 10000
      });
    });
  });

export const downloadCategoryToServer = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    serverIp: z.string(),
    sshUser: z.string().optional().default("root"),
    sshPassword: z.string().optional(),
    sshPort: z.number().optional().default(22),
    categoryName: z.string(),
    items: z.array(z.any())
  }).parse(data))
  .handler(async ({ data }) => {
    console.log(`[SSH] Iniciando download da categoria "${data.categoryName}" para ${data.serverIp}...`);
    
    if (!data.sshPassword) {
      return { success: false, message: "Senha SSH não fornecida." };
    }

    return new Promise((resolve) => {
      const conn = new Client();
      conn.on('ready', () => {
        console.log('[SSH] Cliente pronto, executando script de download...');
        
        // Criar um script shell que baixa cada item
        const folderPath = `/opt/lovable/downloads/${data.categoryName.replace(/\s+/g, '_')}`;
        let script = `mkdir -p "${folderPath}" && cd "${folderPath}"\n`;
        
        data.items.forEach((item: any) => {
          const fileName = `${item.name.replace(/[^\w\s.-]/gi, '_')}.mp4`;
          // Usamos nohup e & para não bloquear o SSH, permitindo que os downloads continuem em background
          script += `nohup wget -c -O "${fileName}" "${item.url}" > /dev/null 2>&1 &\n`;
        });

        conn.exec(script, (err, stream) => {
          if (err) {
            conn.end();
            resolve({ success: false, message: `Erro ao executar comando: ${err.message}` });
            return;
          }
          
          stream.on('close', (code: number) => {
            conn.end();
            resolve({ 
              success: true, 
              message: `Comandos de download enviados! Os arquivos estão sendo baixados em background para ${folderPath}`,
              folder: folderPath
            });
          }).on('data', (data: Buffer) => {
            console.log('[SSH STDOUT] ' + data);
          }).stderr.on('data', (data: Buffer) => {
            console.log('[SSH STDERR] ' + data);
          });
        });
      }).on('error', (err) => {
        resolve({ success: false, message: `Erro de conexão: ${err.message}` });
      }).connect({
        host: data.serverIp,
        port: data.sshPort,
        username: data.sshUser,
        password: data.sshPassword,
        readyTimeout: 20000
      });
    });
  });
