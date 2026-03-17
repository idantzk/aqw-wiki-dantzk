# Como publicar um pacote limpo

## Gerar o ZIP limpo

Rode:

`scripts\build-release-package.bat`

Isso cria:

`dist\AQW-WIKI-DANTZK.zip`

Esse ZIP inclui apenas:
- `content`
- `data`
- `images`
- `popup`
- `background.js`
- `manifest.json`
- `README.md`

Nao inclui:
- `scripts`
- `.git`
- `.gitignore`
- `data\backups`

## Publicar no GitHub Releases

1. Abra seu repositório no GitHub.
2. Clique em `Releases`.
3. Clique em `Draft a new release`.
4. Coloque uma tag, por exemplo:
   `v1.0.0`
5. Coloque um titulo, por exemplo:
   `AQW WIKI DANTZK v1.0.0`
6. Anexe o arquivo:
   `dist\AQW-WIKI-DANTZK.zip`
7. Clique em `Publish release`.

## O que a pessoa faz

1. Baixa o ZIP do Release.
2. Extrai a pasta.
3. Abre `chrome://extensions/`.
4. Ativa `Modo do desenvolvedor`.
5. Clica em `Carregar sem compactacao`.
6. Seleciona a pasta extraida.
7. Abre o popup e clica em `Atualizar base`.
