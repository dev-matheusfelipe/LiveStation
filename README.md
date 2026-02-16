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
4. Rode:
```bash
npm run dev
```

## Rotas

- `/login`: entrar e cadastrar.
- `/watch`: estacao de multiplas telas (protegida).

## Observacoes

- Usuarios sao gravados em `data/users.json` (MVP local).
- Para producao, o ideal e trocar por banco de dados real.
# LiveStation
