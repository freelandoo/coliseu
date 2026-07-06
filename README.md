# Coliseu CRM — Academia Coliseu Team

CRM de academia que implementa o fluxograma operacional em **4 estágios
integrados**, com identidade visual *Industrial Coliseum* (cinza dark +
vermelho fosco) e animações em **GSAP**.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (design system via `@theme` em `globals.css`)
- **GSAP** + `@gsap/react` (`useGSAP`) para as animações
- Tipografia: **Oswald** (display condensada) + **Sora** (corpo)

## Os 4 estágios

| Rota | Estágio | O que faz |
|------|---------|-----------|
| `/painel` | Visão geral | Métricas consolidadas dos 4 estágios |
| `/captacao` | 1 · Captação | Kanban de leads por origem (WhatsApp, redes, balcão, indicação) e funil |
| `/matricula` | 2 · Matrícula | Planos + esteira animada da matrícula + integração Asaas |
| `/cobranca` | 3 · Cobrança | Avisos de vencimento, inadimplência e renovação de planos |
| `/retencao` | 4 · Retenção | Presença e reativação por faixas de 7 / 14 / 21 dias |

## Integrações

- **Asaas** — cliente em [`src/lib/asaas.ts`](src/lib/asaas.ts) (criar cliente,
  gerar cobrança, link de pagamento via WhatsApp). Roda mockado sem credenciais.
- **Webhook Asaas** — [`src/app/api/webhooks/asaas/route.ts`](src/app/api/webhooks/asaas/route.ts)
  trata `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` / `PAYMENT_OVERDUE`.
- **WhatsApp** — links `wa.me` gerados a partir do telefone do lead/aluno.

## Rodar

```bash
npm install
cp .env.example .env.local   # opcional: credenciais Asaas
npm run dev                  # http://localhost:3000
npm run build                # build de produção
```

> Os dados são de demonstração ([`src/lib/mock-data.ts`](src/lib/mock-data.ts)).
> Próximo passo: trocar os mocks por persistência real (DB + Asaas) e auth.
