# Deploy do Kind Communication Hub no aaPanel com Flussonic

Este projeto foi pensado para rodar no aaPanel e automatizar o fluxo de:

1. conectar por SSH na maquina do Flussonic
2. baixar os videos selecionados
3. montar a playlist do canal
4. gravar o bloco do stream no `flussonic.conf`
5. recarregar o Flussonic

## O que o projeto faz hoje

- importa listas M3U
- separa filmes, series e ao vivo
- permite criar categorias personalizadas
- conecta no servidor por SSH
- provisiona um canal no Flussonic com base na categoria selecionada

## Como publicar no aaPanel

1. Suba o projeto para o diretorio do site no aaPanel.
2. Instale as dependencias do projeto com o gerenciador do ambiente.
3. Configure a aplicacao para rodar como app Node/TanStack Start.
4. Garanta que o processo tenha acesso de rede para sair via SSH ate o Flussonic.
5. Abra a interface no navegador e use a aba `Conectar Servidor`.

## Porta recomendada

Use a porta `8657` no aaPanel.

Comando de start:

```bash
HOST=0.0.0.0 PORT=8657 npm start
```

## Requisito no Flussonic

Na maquina do Flussonic, a configuracao precisa ter uma VOD location apontando para:

```conf
vod vod {
  storage /opt/flussonic/priv;
}
```

Se isso nao existir ainda, voce pode preparar uma vez com o comando que a tela de servidor mostra.

## Fluxo automatico do canal

Quando voce clica em `Criar canal no Flussonic`, o sistema:

- cria uma pasta para a categoria
- baixa cada arquivo da lista
- gera `playlist.txt`
- adiciona ou atualiza o bloco do stream no `flussonic.conf`
- recarrega o serviço `flussonic`

## Estrutura de destino no servidor

Exemplo:

```text
/opt/flussonic/priv/minha-categoria/
  001-video-um.mp4
  002-video-dois.mp4
  003-video-tres.mp4
  playlist.txt
```

## Exemplo de stream gerado

```conf
stream minha-categoria {
  input playlist:///opt/flussonic/priv/minha-categoria/playlist.txt;
}
```

## Observacoes importantes

- O projeto aceita conexao por senha ou chave SSH, dependendo da configuracao do host.
- Cada categoria pode virar um canal automatico.
- Se voce quiser varios canais por categoria, basta criar varias categorias e enviar cada uma separadamente.

## Proximo passo recomendado

Depois de publicar no aaPanel, o ideal e validar:

1. login SSH no Flussonic
2. criacao de uma categoria pequena de teste
3. geracao da playlist
4. reload do Flussonic
5. abertura do HLS no player
