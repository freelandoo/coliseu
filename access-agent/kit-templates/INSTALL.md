# Coliseu Agent — Instalação na academia (primeiro contato via AnyDesk)

O agente liga a catraca **Control iD iDFace** ao CRM na nuvem. Ele roda como
**serviço do Windows**: inicia com o PC, funciona sem ninguém logado e se
reinicia sozinho se cair. Sem internet, a catraca continua liberando/bloqueando
por conta própria; os giros sincronizam quando a conexão volta.

## Antes da visita (no seu computador)

1. Gere o kit: `npm run make-kit` (pasta `dist/coliseu-agent-kit/`).
2. Preencha o `.env` do kit:
   - `BACKEND_URL` — endereço do CRM na nuvem
   - `AGENT_TOKEN` — o MESMO token configurado na nuvem
   - `DEVICE_ID` — copie do dashboard `/acesso`
   - Deixe só `IDFACE_HOST` vazio (descobre lá).

## Na academia (via AnyDesk) — 5 passos

1. **Copie a pasta** do kit para `C:\coliseu-agent\` no PC da recepção.
2. **Descubra o IP da catraca**: na tela do iDFace, Menu → Rede (ex.: `192.168.0.50`).
3. **Edite o `.env`** (bloco de notas) e preencha `IDFACE_HOST=` com esse IP.
4. **Botão direito em `install.bat` → "Executar como administrador".**
   O script instala o Node (se faltar), valida o `.env`, registra e inicia o serviço.
5. **Confirme**: abra o CRM → `/acesso` → a catraca deve aparecer **ONLINE**.

Pronto. Pode fechar o AnyDesk — o serviço fica rodando sozinho.

## Dia a dia

| Quero… | Faço… |
|---|---|
| Ver se está tudo bem | duplo clique em `status.bat` (ou o log em `logs\agent.log`) |
| Atualizar o agente | copiar a versão nova como `coliseu-agent.new.cjs` e rodar `update.bat` (admin) |
| Remover | `uninstall.bat` (admin) |

## Problemas comuns

| Sintoma no log | Causa provável | Solução |
|---|---|---|
| `OFFLINE: nuvem inacessível` | internet da academia caiu ou `BACKEND_URL` errado | catraca segue funcionando; confira internet/URL |
| `DEVICE FALHOU: catraca inacessível` | `IDFACE_HOST` errado ou catraca em outra rede | confira o IP no aparelho (Menu → Rede) |
| `heartbeat HTTP 401` | `AGENT_TOKEN` diferente do configurado na nuvem | iguale o token nos dois lados |
| `Campos faltando no .env` | `.env` incompleto | preencha o campo indicado e rode `install.bat` de novo |
| Serviço não aparece | `install.bat` sem admin | rode como administrador |
| Catraca resetada de fábrica e giros pararam de sincronizar | ids de log do aparelho reiniciaram; o cursor local ficou "no futuro" | pare o serviço (`status.bat` p/ conferir), apague o arquivo `.agent-cursor-*` da pasta e inicie de novo |
