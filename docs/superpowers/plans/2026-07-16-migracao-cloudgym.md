# Migração CloudGym → Coliseu (adoção da base facial do iDFace) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).

**Goal:** Trocar CloudGym por Coliseu sem que nenhum aluno precise recadastrar a face, em corte seco (os dois sistemas nunca escrevem no aparelho ao mesmo tempo).

> **STATUS 2026-07-17:** Tasks 1, 4, 5 e 6 implementadas e testadas (suíte 109/109).
> Tasks 2 e 3 foram cumpridas pelos exports que o Alex coletou em `usuarios/`
> (pen drive + painel CloudGym — pasta gitignorada, biometria/LGPD).
> **Respostas de campo:** `registration` está VAZIO em todos os 1.154 usuários ⇒ chave
> é nome normalizado; os exports perderam acentos (U+FFFD) ⇒ matching trata `�` como
> curinga de 1 letra; maior user_id no aparelho = **11.097.953** (e há 20 ids negativos)
> ⇒ `ACCESS_EXTERNAL_ID_FLOOR=11097953`; 1.144/1.154 têm foto.
> **Conciliação real:** 699 ADOTAR · 82 REVISAR · 2 AMBÍGUOS · 371 órfãos (263 com
> acesso em 2026 — revisar com a recepção; suspeita: `alunosinativos.csv` truncado em
> 1.000 linhas, re-exportar as páginas seguintes) · 86 ativos sem face.
> Saídas em `usuarios/migracao/` (conciliacao.json, resumo.txt, revisao-recepcao.csv).
> Rodar: `npx tsx scripts/migracao/conciliar.ts` e `npx tsx scripts/migracao/adotar.ts [--apply]`.

**Insight central:** As faces **nunca estiveram no CloudGym**. Elas moram no iDFace. O CloudGym só empurra `users` pro aparelho pela mesma API REST que o `access-agent` já usa. Portanto isto **não é uma migração de biometria — é uma migração de mapeamento de IDs**. O Coliseu precisa *adotar* os `user_id` que já existem no aparelho, em vez de alocar IDs novos por cima.

**Consequência:** a migração roda inteira no banco do Coliseu. Nenhum template facial é lido, copiado ou transportado. Isso preserva a decisão de arquitetura já registrada no schema: `deviceRef // id no dispositivo (NUNCA template bruto)`.

---

## Fatos verificados na API Control iD (linha de Acesso)

| Fato | Fonte | Impacto |
|---|---|---|
| `users` expõe `id`, `registration`, `name`, `image_timestamp` | doc "Lista de objetos" | Inventário completo por `load_objects.fcgi` |
| `image_timestamp = 0` ⇒ usuário **não tem foto salva** | idem | Define se há plano B por foto |
| `templates` só existe para **digital** (`finger_type`) | idem | **Template facial não é exportável via API** |
| `user_get_image.fcgi?user_id=X` → JPG binário | doc "Gerenciar fotos" | Plano B: baixar as fotos |
| `user_set_image.fcgi` regenera o template a partir da foto | doc "Cadastro facial por fotos" | Reconstrução sem o aluno presente |
| Export por pen drive (`Sincronização`) leva faces e reimporta em **outro** aparelho | doc iDFace Importar/Exportar | **Único** caminho que move face entre aparelhos ⇒ é o rollback |

**Limite duro:** a adoção só funciona **no mesmo aparelho físico**. Trocar o iDFace exige export por pen drive (ou refazer via fotos, se houver).

## Dois riscos descobertos no código atual

**R1 — Sequestro de usuário órfão (segurança).** `proximoExternalUserId()` (`src/lib/access/provision.ts:47-55`) calcula `max+1` sobre `DeviceUserMapping` com piso 1000, ignorando o aparelho. Usuários do device não adotados são invisíveis ao allocator. Se um órfão ocupa o id 750 e o Coliseu aloca 750 para um aluno novo, `create_or_modify_objects` troca o **nome** mas a **face do órfão permanece** — o ex-aluno entra sendo reconhecido como o aluno novo. Corrigir **antes** do corte (Task 1).

**R2 — Perda irreversível da chave de casamento.** `upsertUser()` (`access-agent/src/adapters/controlid/controlid-device.ts:56-65`) grava `registration: input.externalUserId`. O primeiro UPSERT do Coliseu **sobrescreve a matrícula do CloudGym** no aparelho — que é exatamente a chave de conciliação. Ordem obrigatória: **inventário salvo → conciliação → adoção → só então o agente escreve.**

## Chave de casamento

Cadeia pretendida, unindo as três bases:

```
iDFace.users.registration  ==  Person.codigo  ==  matrícula do CloudGym
```

`Person.codigo` é `@unique` no schema — serve de junta natural. **A validar em campo (Task 2):** o que o CloudGym realmente gravou em `registration`. Se for a matrícula, a conciliação é automática. Se for ID interno do CloudGym, o export do CloudGym precisa trazer esse ID. Se estiver vazio, cai-se para nome normalizado + conferência manual.

## Sequenciamento (remoto vs. presencial)

- **Remoto (agora):** Tasks 1, 4 — correção do allocator e normalizador do export CloudGym.
- **Presencial (visita à academia):** Tasks 2, 3 — inventário e fotos. Exigem LAN do aparelho.
- **Remoto (pós-visita):** Tasks 5, 6 — conciliação e adoção, sobre os JSONs coletados.
- **Presencial (corte):** Task 7 — runbook.

O backend roda no Railway e **não alcança o iDFace** (LAN da academia) — é para isso que existem o outbox e o agente. Os scripts de inventário rodam na máquina do agente, não no backend.

---

### Task 1: Piso de alocação seguro (R1)

**Files:**
- Modify: `src/lib/access/provision.ts`
- Modify: `src/lib/access/provision.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Teste falhando**

```ts
// provision.test.ts
it("nunca aloca id abaixo do piso configurado (evita sequestro de órfão do device)", async () => {
  process.env.ACCESS_EXTERNAL_ID_FLOOR = "4823";
  // sem mappings: primeiro id deve ser 4824, não 1001
  const id = await proximoExternalUserId();
  expect(Number(id)).toBe(4824);
});
```

- [ ] **Step 2: Implementar** — trocar o literal `1000` por `Number(process.env.ACCESS_EXTERNAL_ID_FLOOR ?? 1000)`, exportar `proximoExternalUserId` para teste, documentar em `.env.example`:

```
# Piso de alocação de user_id no iDFace. DEVE ser > maior id existente no aparelho
# (ver docs/migracao/inventario-device.json). Protege contra sequestrar a face de
# um usuário legado não adotado. Ver plano 2026-07-16-migracao-cloudgym.md (R1).
ACCESS_EXTERNAL_ID_FLOOR=1000
```

- [ ] **Step 3:** `npm test` verde.

---

### Task 2: Inventário do aparelho (presencial — LAN)

**Files:**
- Create: `access-agent/src/migracao/inventario.ts`
- Create: `access-agent/src/migracao/inventario.test.ts`

Reusa `ControlIdClient` (já faz login + re-login). Pagina `load_objects.fcgi` sobre `users` e cruza com `user_access_rules` para saber quem está habilitado hoje.

- [ ] **Step 1:** Teste com client fake — paginação e mapeamento de `image_timestamp` → `temFoto`.
- [ ] **Step 2:** Implementar. Saída `docs/migracao/inventario-device.json`:

```json
{
  "coletadoEm": "2026-07-20T14:00:00Z",
  "host": "192.168.0.50",
  "maiorUserId": 4823,
  "totalUsuarios": 812,
  "comFoto": 794,
  "semFoto": 18,
  "usuarios": [
    { "id": 237, "name": "MARIA SILVA", "registration": "1042",
      "imageTimestamp": 1719000000, "temFoto": true, "habilitado": true }
  ]
}
```

- [ ] **Step 3:** Rodar na academia. **Commitar o JSON** — ele é a única prova do estado pré-corte (R2).
- [ ] **Step 4:** Ler o relatório e decidir: `registration` está preenchido? É a matrícula? `semFoto` é grande? Registrar a resposta no topo deste plano.

---

### Task 3: Cofre de fotos (presencial — LAN, condicional)

Só se `comFoto > 0`. É a apólice: com os JPGs, dá para reconstruir a base facial **em qualquer aparelho**, sem nenhum aluno presente. Sem eles, um iDFace queimado = recadastro geral.

**Files:**
- Create: `access-agent/src/migracao/baixar-fotos.ts`

- [ ] **Step 1:** Para cada `temFoto`, `GET /user_get_image.fcgi?user_id=X&session=…` → `docs/migracao/fotos/<id>.jpg`. Serial com pausa curta; o aparelho é modesto.
- [ ] **Step 2:** Conferir contagem = `comFoto`. Reportar divergência.
- [ ] **Step 3:** **NÃO commitar as fotos** — é biometria, LGPD. `.gitignore` em `docs/migracao/fotos/`. Guardar cifrado, fora do repo, com retenção definida.
- [ ] **Step 4 (crítico):** Export por pen drive no aparelho — `MENU → CADASTROS → IMPORTAR/EXPORTAR → EXPORTAR → Sincronização`. É o rollback verdadeiro (leva os templates). Guardar o `.zip` fora do repo.

---

### Task 4: Normalizar o export do CloudGym (remoto)

**Files:**
- Create: `src/lib/migracao/cloudgym.ts`
- Create: `src/lib/migracao/cloudgym.test.ts`

Entrada esperada: CSV/XLSX do painel (Relatórios → alunos). Campos mínimos: matrícula, nome, CPF, plano, vencimento, status.

- [ ] **Step 1:** Testes de normalização — CPF só dígitos, nome `trim`+upper sem acento, datas BR → ISO, status → `fase`.
- [ ] **Step 2:** Implementar `parseCloudGym(csv): AlunoCloudGym[]`. Tolerante a coluna faltando: acumula avisos, não estoura.
- [ ] **Step 3:** Saída `docs/migracao/cloudgym-normalizado.json` (sem CPF em claro se for commitar — preferir não commitar).

---

### Task 5: Conciliação 3-vias (remoto)

**Files:**
- Create: `src/lib/migracao/conciliar.ts`
- Create: `src/lib/migracao/conciliar.test.ts`

Cruza `inventario-device.json` × `cloudgym-normalizado.json` × `Person` do Coliseu. **Só relatório — não escreve nada.**

Cascata de casamento, com a confiança registrada por linha:
1. `device.registration == cloudgym.matricula` → `ALTA`
2. `cloudgym.cpf == Person.cpf` → `ALTA`
3. nome normalizado exato e único nos dois lados → `MEDIA`
4. resto → `NENHUMA`

- [ ] **Step 1:** Testes dos quatro baldes + o caso que mais dói: **dois alunos com o mesmo nome** deve cair em `AMBIGUO`, nunca casar. Casar errado dá acesso da pessoa errada.
- [ ] **Step 2:** Implementar. Saída `docs/migracao/conciliacao.json` + resumo legível:

```
812 no aparelho | 780 no CloudGym | 0 no Coliseu
── 758 casados (ALTA)      → adotar
──   9 casados (MEDIA)     → revisar antes de adotar
──   6 ambíguos            → resolver na mão
──  39 órfãos no aparelho  → NÃO adotar; piso = 4824 (Task 1)
──  13 no CloudGym sem face no aparelho → recadastro presencial
```

- [ ] **Step 3:** Revisar `MEDIA` e `AMBIGUO` com a recepção. Quem conhece os alunos resolve em minutos o que o script não resolve nunca.

---

### Task 6: Adoção (remoto, idempotente)

**Files:**
- Create: `src/lib/migracao/adotar.ts`
- Create: `src/lib/migracao/adotar.test.ts`

Aplica a conciliação no banco. Para cada casado (ALTA, ou MEDIA aprovado):

1. `Person` — cria/atualiza com `codigo = matrícula do CloudGym`, `fase = "aluno"`.
2. `Membership` — plano e vencimento vindos do CloudGym.
3. `DeviceUserMapping` — `externalUserId = id do aparelho`, `syncStatus = "IN_SYNC"`.
4. `AccessCredential` — `type FACE`, `status ENROLLED`, `deviceRef = id do aparelho`, `enrolledAt = imageTimestamp`.

**Por que `IN_SYNC` e não `PENDING`:** o usuário já existe no aparelho. `PENDING` faria `provisionarAcessoDePessoa` enfileirar um UPSERT, e o UPSERT sobrescreve `registration` (R2) sem necessidade. A propriedade elegante: `provisionarAcessoDePessoa` já reusa `existentes[0]?.externalUserId` — **com o mapping pré-semeado, toda a máquina existente funciona sem alteração.** A adoção é só semear a tabela certa.

- [ ] **Step 1:** Testes — idempotência (rodar 2× não duplica), `externalUserId` == id do aparelho, credencial nasce `ENROLLED`, `--dry-run` não escreve.
- [ ] **Step 2:** Implementar com `--dry-run` **default**; exige `--apply` explícito.
- [ ] **Step 3:** Após o apply, conferir `ACCESS_EXTERNAL_ID_FLOOR` ≥ `maiorUserId` do inventário e reiniciar o backend.

---

### Task 7: Runbook do corte (presencial)

**Files:**
- Create: `docs/migracao/RUNBOOK-CORTE.md`

Ordem não-negociável (R2: o inventário precisa estar salvo antes de qualquer escrita do Coliseu):

- [ ] 1. Export pen drive `Sincronização` → rollback no bolso. **Sem isso, não continua.**
- [ ] 2. Inventário (Task 2) + fotos (Task 3) coletados e conferidos.
- [ ] 3. **Desligar a integração do CloudGym com o iDFace.** A partir daqui, o aparelho tem um dono só.
- [ ] 4. `ACCESS_EXTERNAL_ID_FLOOR = maiorUserId` do inventário. Redeploy.
- [ ] 5. Conciliação revisada (Task 5) — `AMBIGUO` zerado.
- [ ] 6. `adotar --apply` (Task 6).
- [ ] 7. Subir o agente apontando pro device.
- [ ] 8. **Smoke com gente de verdade:** 3 alunos adotados (um adimplente, um inadimplente, um em carência) passam a catraca. O adimplente entra, o inadimplente é barrado. Sem isso, não está migrado — está torcendo.
- [ ] 9. Recadastrar presencialmente só os 13 sem face. Fila de recepção mínima.

**Rollback:** reimportar o `.zip` por pen drive e religar o CloudGym. Janela de risco = passo 3 → 8; fazer em horário de baixo movimento (manhã de terça, não segunda 18h).

---

## Decisões em aberto

- [x] `registration` no aparelho contém matrícula do CloudGym? → **NÃO: vazio em todos.** Conciliação por nome normalizado (+ curinga de acento). O export do CloudGym também não traz matrícula ⇒ `Person.codigo` segue a sequência própria do Coliseu (CD*).
- [x] `image_timestamp` ≠ 0 na maioria? → **SIM: 1.144 de 1.154 têm foto** (plano B existe).
- [x] Formato real do export do CloudGym → CSVs do painel (ativos com CPF; inativos SEM CPF e sem Status; parser tolera).
- [ ] Re-exportar inativos além da linha 1.000 (suspeita de paginação truncada) — deve reduzir os 371 órfãos.
- [ ] Revisar `usuarios/migracao/revisao-recepcao.csv` com a recepção (82 REVISAR + 2 AMBÍGUOS + órfãos com acesso 2026).
- [ ] Retenção das fotos pós-migração — LGPD: propósito acabou, apagar. Definir prazo.
