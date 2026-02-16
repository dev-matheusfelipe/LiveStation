# Rizzer LiveStation 

Aplicacao web para assistir varios videos/canais do YouTube ao mesmo tempo, com login por e-mail e senha.

## Funcionalidades

- Cadastro e login com sessao em cookie.
- Area protegida (`/watch`) para usuarios autenticados.
- Header com nome do site.
- Campo para colar link do YouTube.
- Barra lateral com layouts disponiveis.
- Grade dinamica para reproduzir varias telas ao mesmo tempo.

## Rodar local

1. Instale dependencias:
```bash
npm install
```
2. Configure ambiente:
```bash
copy .env.example .env.local
```
3. Defina `AUTH_SECRET` em `.env.local`.
4. Defina `NEXT_PUBLIC_SITE_URL` com a URL publica do site.
5. (Opcional) Defina `LIVESTATION_DATA_DIR` para persistencia do SQLite em producao.
6. Rode:
```bash
npm run dev
```

## Rotas

- `/login`: entrar e cadastrar.
- `/watch`: estacao de multiplas telas (protegida).

## Observacoes

- Usuarios sao gravados em SQLite (`livestation.sqlite`), com fallback para diretorio temporario quando necessario.
- Para producao, o ideal e definir `LIVESTATION_DATA_DIR` em um volume persistente ou migrar para banco gerenciado.

## SEO e Indexacao

- `robots.txt`: `/robots.txt`
- `sitemap.xml`: `/sitemap.xml`
- `manifest.webmanifest`: `/manifest.webmanifest`
- Rotas privadas (`/watch` e `/api/*`) estao marcadas para nao indexacao.

Depois de publicar:

1. Cadastre o dominio no Google Search Console e no Bing Webmaster Tools.
2. Envie o sitemap `https://seu-dominio.com/sitemap.xml`.
3. Solicite indexacao da home e da pagina de login.
