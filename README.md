# Rizzer LiveStation 

Aplicacao web para assistir varios videos/canais do YouTube ao mesmo tempo, com login por e-mail e senha.

## Funcionalidades

- Cadastro com verificacao por e-mail e login com sessao em cookie.
- Bloqueio de usernames reservados/famosos no cadastro publico.
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
5. (Opcional) Para monetizacao com Google AdSense, configure `NEXT_PUBLIC_ADSENSE_CLIENT` e slots.
6. Para producao, defina `DATABASE_URL` (Postgres) para persistencia de usuarios.
7. Configure SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) para envio do link de verificacao.
8. Configure a conta padrao da Rizzer (`RIZZER_DEFAULT_*`).
9. (Opcional) Defina `LIVESTATION_DATA_DIR` para SQLite local.
10. Rode:
```bash
npm run dev
```

## Rotas

- `/login`: entrar e cadastrar.
- `/watch`: estacao de multiplas telas (protegida).

## Observacoes

- Quando `DATABASE_URL` esta definido, usuarios sao persistidos em Postgres.
- Sem `DATABASE_URL`, o projeto usa SQLite (`livestation.sqlite`) com fallback local/temporario para desenvolvimento.
- Em producao, o cadastro depende da verificacao por e-mail (link enviado via SMTP).
- A conta padrao da Rizzer pode ser provisionada automaticamente via variaveis `RIZZER_DEFAULT_*`.
- A monetizacao com AdSense e opcional e so exibe anuncios quando `NEXT_PUBLIC_ADSENSE_CLIENT` e os slots sao configurados.

## SEO e Indexacao

- `robots.txt`: `/robots.txt`
- `sitemap.xml`: `/sitemap.xml`
- `manifest.webmanifest`: `/manifest.webmanifest`
- Rotas privadas (`/watch` e `/api/*`) estao marcadas para nao indexacao.

Depois de publicar:

1. Cadastre o dominio no Google Search Console e no Bing Webmaster Tools.
2. Envie o sitemap `https://seu-dominio.com/sitemap.xml`.
3. Solicite indexacao da home e da pagina de login.
