# AQW WIKI DANTZK

Extensao para AQW Wiki com:
- preview de itens
- marcacao de itens que voce tem ou nao tem
- sincronizacao de inventario
- marcacao de badges
- atualizacao da base pelo popup

## Como instalar

1. Baixe o projeto em `.zip` e extraia a pasta.
2. Abra `chrome://extensions/` no Chrome ou Edge.
3. Ative `Modo do desenvolvedor`.
4. Clique em `Carregar sem compactacao`.
5. Selecione a pasta da extensao.

## Como atualizar a base

1. Abra o popup da extensao.
2. Clique em `Atualizar base`.
3. Espere a mensagem de base atualizada.

## Como sincronizar seus itens

1. Abra sua pagina de inventario AQW.
2. Espere a extensao sincronizar.
3. Volte para a Wiki e recarregue a pagina.

## Observacoes

- A extensao usa a base local do projeto e tambem pode baixar a base mais nova do GitHub.
- Se algo nao atualizar, recarregue a extensao em `chrome://extensions/` e depois de `F5` na pagina.

## Distribuicao

Para criar um pacote limpo para a galera baixar:

`scripts\build-release-package.bat`

Guia rapido de publicacao:

`RELEASES.md`
