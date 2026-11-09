# GTDone — Plano de Implementação

Este documento é o plano completo para implementar o GTDone: um app web multiplataforma de tarefas e projetos baseado no fluxo Getting Things Done (GTD), com recursos funcionais inspirados no Nirvana. O foco é reproduzir os fluxos e capacidades, com código e identidade visual próprios.

## Visão e decisões

- **Produto:** GTDone, interface inicialmente em português.
- **Plataformas:** webapp responsivo e instalável como PWA em navegadores modernos de desktop, tablet e celular.
- **Servidor:** uma máquina própria, inicialmente para uso pessoal com uma conta.
- **Acesso remoto:** somente pela VPN, sem expor diretamente o serviço à internet pública.
- **Persistência:** SQLite em arquivo local à máquina que hospeda o backend; todos os dispositivos conectados acessam a mesma base central.
- **Stack inicial:** TypeScript, SvelteKit, adapter-node e `node:sqlite` do Node.js 24.
- **Offline:** não faz parte do primeiro escopo. A PWA exige conectividade com a máquina pela VPN para ler e gravar dados.
- **Referência de produto:** [guia rápido do Nirvana](https://www.nirvanahq.com/help/quick-guide), [features do Nirvana](https://www.nirvanahq.com/features) e tópicos públicos do [centro de ajuda](https://www.nirvanahq.com/help/quick-guide).
- **Marca e propriedade intelectual:** criar identidade visual e implementação próprias; não copiar código, imagens ou textos do Nirvana, nem sugerir afiliação com Nirvana ou David Allen Company.

## Princípios GTD do produto

- **Capturar:** permitir registrar qualquer coisa rapidamente na Inbox, sem exigir classificação durante a captura.
- **Esclarecer:** processar cada item e decidir se é acionável, referência, projeto, algo a fazer agora, algo a delegar, algo a adiar ou algo a eliminar.
- **Organizar:** manter listas com significados distintos. Next é ação disponível; Waiting é delegada ou aguardando; Scheduled fica indisponível até a data de início; Someday/Maybe guarda possibilidades sem compromisso atual.
- **Projetos:** representar resultados que exigem mais de uma ação e tornar visível a próxima ação física e concreta.
- **Datas:** distinguir início/agendamento de prazo final. A data de início determina quando a ação aparece para execução; deadline indica um compromisso real.
- **Contexto:** permitir escolher ações compatíveis com lugar, ferramenta, pessoa, energia e tempo disponíveis.
- **Focus:** oferecer uma seleção intencional e curta do que merece atenção, sem substituir as listas completas nem transformar todas as datas em tarefas prioritárias.
- **Refletir:** incluir revisão semanal para manter projetos, listas e compromissos confiáveis.
- **Confiabilidade:** preservar histórico, permitir restauração, exportar os dados e comprovar que backups podem ser restaurados.

## Arquitetura e operação

- O frontend SvelteKit será compilado para o adapter-node e executado num processo Node.js na máquina própria.
- A camada de servidor é a única que abre e consulta o arquivo SQLite. O browser não acessa diretamente o arquivo.
- O banco deve permanecer em disco local da máquina, não em filesystem de rede. Usar WAL, chaves estrangeiras, transações e migrações versionadas.
- A conta inicial é criada uma vez em `/setup`; acesso posterior exige login. Senhas são armazenadas como hash scrypt e sessões são persistidas no SQLite.
- Cookies de sessão devem ser `httpOnly`, `sameSite=lax` e `secure` quando HTTPS estiver configurado.
- Para uso via VPN, configurar HTTPS por proxy reverso ou certificado apropriado, manter o serviço restrito à VPN e não encaminhar portas públicas sem uma decisão explícita.
- O banco e os backups devem ter permissões restritas ao usuário de serviço. A máquina deve receber atualizações de segurança.
- O agendador cria um backup no boot e a cada 24 horas, com retenção configurável. A cópia local não protege contra falha ou perda da máquina; backups devem ser replicados para armazenamento separado e protegido.
- A disponibilidade remota depende da máquina ligada, do serviço Node ativo e da VPN acessível.

## Direção de interface baseada nos templates

As imagens em `template/` definem a organização funcional desejada. Elas servem como referência de fluxo e hierarquia, não como identidade visual a copiar: a interface do GTDone deve ter marca, textos e estilo próprios e permanecer em português.

- **Estrutura global:** navegação lateral com Inbox, Next, Later, Waiting, Scheduled, Someday e Focus; projetos ativos e áreas/tags acessíveis na própria navegação; Logbook e Trash no rodapé. A barra superior reúne filtro global por área, menu de criação rápida, busca e acesso às preferências.
- **Visual:** as capturas usam tema escuro, linhas compactas e baixo contraste decorativo; oferecer tema escuro e preferências de aparência/densidade, mantendo identidade própria e legibilidade.
- **Listas:** cada lista mostra título e contexto, captura rápida e itens em linhas compactas, com controles de conclusão, Focus, notas/detalhes, ordenação manual e ações contextuais. Filtros ativos aparecem como chips; contagens devem destacar itens que requerem atenção.
- **Detalhe de item:** edição sem perder contexto da lista, com título, notas, área/tags/contatos, tempo, energia, prazo e destino. O estado da lista e a associação a projeto são explícitos; data de início/agendamento e deadline são campos diferentes.
- **Projetos:** lista lateral abre a visão do projeto; o detalhe exibe resultado desejado, notas e ações agrupadas. Projeto pode ser ativo, Later, Scheduled ou Someday. Projeto ativo pode organizar ações em sequência ou permitir execução paralela.
- **Áreas e preferências:** seletor global de área com opção de gerenciar áreas; preferências cobrem aparência/densidade, idioma e datas, workflow, sidebar e opções avançadas.
- **Imagens de referência:** `menu lateral ...` cobre listas e visões; `menu novo item.png` e `menu lateral inbox detalhe do item.png` cobrem captura e edição; `menu seletor de areas.png` cobre filtro por área; imagens `config ...` cobrem preferências; as duas imagens `projetos opção ...` definem estados e ordem de execução dos projetos.

## Roadmap por fases

### Situação atual

- Os escopos principais das Fases 1–5 e os recursos de portabilidade/integrações da Fase 6 estão implementados.
- Fase 0 está implementada no código e documentada; implantação na máquina de produção, VPN/HTTPS e cópia externa de backups ainda dependem de configuração no ambiente.
- Pendências identificadas: exibir `[Pessoa]`, `[Contexto]` ou `[Área]` nas linhas dos itens; atualizar `.github/copilot-instructions.md`; decidir se e como implementar IA/MCP.
- O bug de densidade relatado anteriormente ainda não foi reproduzido nem resolvido.

### Fase 0 — Fundação e operação

**Implementado**

- Repositório Git criado; trabalho atual na branch `develop`.
- Scaffolding SvelteKit com TypeScript, Vitest e adapter-node.
- Camada SQLite com WAL, foreign keys e migração versionada inicial.
- Schema inicial para usuários, sessões, itens, projetos, áreas, tags, contatos, checklists, recorrências e preferências.
- Conta única inicial, hash de senha com scrypt, autenticação, sessão por cookie e logout.
- Proteção de rotas e páginas iniciais `/setup`, `/login` e home protegida.
- Backup usando `VACUUM INTO`, retenção e teste de restauração.
- Backup automático no boot de produção e a cada 24 horas; variáveis `GTDONE_DB_PATH`, `GTDONE_BACKUP_DIR` e `GTDONE_BACKUP_KEEP`.
- Testes automatizados para banco, autenticação, sessões, backup e agendamento.

**Implementado depois (código)**

- Cookie de sessão `secure` automático em HTTPS (`ORIGIN`) ou com `GTDONE_COOKIE_SECURE=1`.
- Limite de tentativas de login (5 falhas em 15 min por IP/e-mail → bloqueio de 15 min, HTTP 429); sessões expiradas removidas no login.
- Log operacional por eventos, sem dados sensíveis (`GTDONE_LOG_LEVEL`).
- Backups verificados com `PRAGMA integrity_check` (inválidos são descartados).
- Artefatos em `deploy/` (systemd, Caddy, `.env`, backup externo) e guia `docs/OPERACAO.md` (VPN, HTTPS, restauração).
- Branches `main` e `develop` criadas.

**Pendente (depende da máquina de produção)**

- Aplicar na máquina real: instalar o serviço, configurar a VPN/HTTPS e agendar o backup externo, seguindo `docs/OPERACAO.md`; testar a restauração numa instalação limpa.

**Critério de saída:** pendente até a implantação na máquina real, com acesso HTTPS somente pela VPN, backups locais e externos e restauração validada numa instalação limpa.

### Fase 1 — Captura e clarificação

- **Implementado:** shell completo com navegação, listas GTD, projetos, captura rápida, edição contextual, reordenação, atalhos, persistência SQLite, Logbook e lixeira. A Inbox inclui orientação de clarificação de dois minutos.

**Critério de saída:** o shell de navegação e os fluxos de captura/clarificação funcionam sem perda de conteúdo; as ações rápidas de teclado não interceptam digitação em campos.

### Fase 2 — Organização e dados de ação

- **Implementado:** CRUD de áreas, tags e contatos (`/manage/<tipo>`); área, tags, contato delegado, tempo e energia no item; início e prazo independentes (Scheduled vira Next na data); reordenação persistente; referências distintas; estado do projeto (ativo/Later/Scheduled/Someday) com data própria; seletor de área global (cookie) e filtro por tag.
- **Também implementado:** Quick Add com prefixos `!área`, `@pessoa`, `#contexto`; conversão de tipo de tag (Pessoa↔Contexto) no diálogo de tags.
- **Implementado depois:** gerenciamento de cores para áreas, contatos e contextos; seleção de área por prefixo no campo de tags; objetivos também aceitam uma área e acompanham o filtro global de área.
- **Pendente:** mostrar o tipo da tag (Pessoa, Contexto ou Área) junto às tags nas linhas dos itens.

**Critério de saída:** itens podem ser organizados sem perder a semântica GTD, e início e prazo final comportam-se como conceitos separados.

### Fase 3 — Engajar, Focus, filtros e busca

- **Implementado:** Focus manual por estrela e automático por tarefas vencidas/prazo de hoje, com visualizações Ambos/Estrelado/Vencido; filtros combináveis por energia, tempo, contato, projeto, tag, prazo, área e intervalo de início; modos de agrupamento por projeto, contexto, tempo e energia em Próximas e Depois; chips removíveis, ordenação por prazo, contagens e filtros de ações possíveis.
- **Busca:** FTS5 com tokenizador trigram (migração 10), incluindo títulos e notas; consultas menores que três caracteres usam `LIKE`. Também pesquisa projetos e tags.

**Critério de saída:** o usuário consegue selecionar ações possíveis para o contexto atual e encontra itens por texto e metadados.

### Fase 4 — Projetos, revisão e encerramento

- **Implementado:** lista de projetos (`/projects`) por estado com destaque "sem próxima ação"; detalhe com ações agrupadas por estado (Próximas ações, Aguardando, Depois…, Concluídas); modo sequencial/paralelo por projeto (migração v4; no sequencial só a primeira ação aberta aparece em Próximas e Foco); concluir e reabrir projetos (Diário lista projetos concluídos); revisão semanal guiada em `/review` (Inbox, projetos, Próximas, Aguardando, Agendadas, Algum dia); retenção do Diário configurável em `/settings` (0 = guardar tudo); exclusão definitiva individual e "Esvaziar lixeira" com confirmação; seleção múltipla (concluir, mover, tag, Foco, excluir, restaurar).
- **Implementado depois:** enviar projeto à lixeira (leva as ações abertas; restaurar e excluir definitivamente na Lixeira e na página do projeto; "Esvaziar lixeira" inclui projetos) e edição em lote de prazo, início, energia e tempo.
- **Implementado depois:** a retenção do Diário também apaga projetos concluídos antigos sem ações vinculadas.
- **Outros comportamentos implementados:** projetos em Later/Someday aparecem como inativos; opção de mostrar/ocultar na lateral; ações agrupadas por estado com limite de exibição por grupo; próxima ação pode ser criada inline na revisão semanal.

**Critério de saída:** o app suporta o ciclo capturar, esclarecer, organizar, refletir e engajar, mantendo histórico recuperável.

### Fase 5 — Recursos avançados e fluidez

- **Implementado:** checklists por item (editor + progresso ☑ n/m na linha); recorrência diária/semanal/mensal/anual a cada N (ao concluir, a próxima ocorrência é criada uma única vez e a regra migra para ela; exige data); links http(s) nas notas listados no editor; duplicar item (menu e `D`); atalhos de teclado (`1–9/0` navegação, `J/K`, `Enter`, `C`, `*`, `T`, `D`, `Delete`, `?` ajuda; lista também em Preferências › Atalhos); página Referência (`/reference`) com criação, busca e conversão; Preferências com 5 abas + Atalhos, salvas automaticamente na tabela `settings` (`pref.*`): tema, cor de destaque, densidade, alinhamento do conteúdo, formato de data, início da semana, prazos relativos/absolutos, entrada rápida, concluídos ao fim, contadores, posição do Foco, Depois/Aguardando, projetos sequenciais na barra, atribuir área ao sair da Entrada, itens sem área sob filtro, retenção do Diário.
- **Implementado depois:** inglês (en-US); links clicáveis com domínio na linha do item; recorrência por dias da semana, contagem a partir da conclusão e término por data ou número de ocorrências. A regra é serializada no formato `unit:every;wd=1,3;after=1;until=AAAA-MM-DD;count=N`.

**Critério de saída:** tarefas repetitivas, checklists e navegação rápida funcionam em desktop, sem degradar os fluxos móveis.

### Fase 6 — Portabilidade e integrações

- **Implementado:** exportação JSON completa (`/settings/export`; todas as tabelas de dados, exceto conta, sessões e segredos de integração); importação com validação estrutural (formato, versão do schema, colunas, tipos, obrigatórios, integridade referencial), modo "só validar", substituição atômica e backup automático antes; copiar lista (markdown) e imprimir, com CSS de impressão; captura por email via webhook `POST /api/inbound-email` (JSON, token Bearer guardado só como hash, lista de remetentes obrigatória, padrão = rejeitar); email periódico do Foco (dias/horário/destinatário em Preferências › Dados e integrações, SMTP por `GTDONE_SMTP_URL` + `GTDONE_MAIL_FROM`, até 3 tentativas/dia a cada 15 min, último erro visível, botão de teste).
- **Avaliado e adiado:** assistente de IA e MCP. Só entram com consentimento explícito por recurso, escopo de leitura/escrita por lista, aviso do que é enviado ao provedor e registro de uso; ficam para depois de definir provedor.
- **Limitações:** o serviço de recebimento de email é externo (o app não abre porta SMTP); o campo "From" pode ser forjado, por isso o token é a proteção principal; importar exige mesma versão de schema do arquivo.

- **Ainda em avaliação:** assistente de IA e integração MCP como recursos opcionais, com controle explícito de permissões e divulgação de dados enviados a serviços externos.

**Critério de saída:** dados podem ser movidos e recursos que dependem de serviços externos têm configuração segura, documentada e testada.

### Complemento — Idioma e preferências de interface

- Preferência **Idioma** (pt-BR padrão, en-US) em Idioma e região; `<html lang>` e `data-*` de tema/densidade são aplicados no servidor (`hooks.server.ts`) e de forma otimista ao alterar.
- Preferência **Referência** (mostrar/ocultar) na barra lateral; oculta também o atalho `9`.
- i18n: o texto em português é a chave; dicionários em `src/lib/i18n/en-*.ts`; componentes usam `useT()`. Limites: login/setup e o email do Foco permanecem em português.

### Complemento — Agendadas e Calendário

- Agendadas lista só itens com data de início (state scheduled), agrupados em Esta semana, Próxima semana e Datas futuras (`template/schedule.png`). O Calendário é um menu próprio (`/calendar`) com seis visões, nesta ordem (Agenda, 3 dias, 7 dias, Semanal, Mensal, Gantt) e três modos: Planejado (início), Prazos e Ambos. O Gantt mostra, em barras por dia do mês, só itens com início e prazo (cruzando o mês; ignora o modo). Visão, modo e data ficam na URL; cada visão consulta só o seu intervalo, via índices de data.

## Catálogo de features de referência

O catálogo abaixo combina os recursos do produto com os fluxos representados nas imagens em `template/`. A ordem de entrega é a indicada nas fases anteriores.

- Shell com navegação lateral para Inbox, Next, Later, Waiting, Scheduled, Someday, Focus, projetos, áreas/tags, Logbook e Trash; barra superior com filtro por área, criação rápida, busca e preferências.
- Captura rápida, edição contextual, atalhos, conclusão, Focus, reordenação e ações em lote.
- Clarificação e movimentação entre listas GTD; referências distinguem-se de tarefas.
- Tarefas com notas, links, tags/áreas/contatos, tempo, energia, início e deadline.
- Projetos com resultado desejado, notas, ações, estados ativo/Later/Scheduled/Someday e execução sequencial ou paralela.
- Listas de referência e conversão entre tarefas, projetos e referências.
- Checklists, duplicação e seleção múltipla.
- Áreas, tags/contextos, contatos, tempo e energia; filtro global de área e chips de filtros.
- Focus manual e por datas; email periódico da Focus.
- Filtros avançados, pesquisa, opções de exibição/densidade, contagens de atenção e ordenação.
- Revisão semanal, conclusão, Logbook, restauração e lixeira.
- Exportação/importação, impressão e cópia para clipboard.
- Preferências de aparência, idioma/data, workflow, sidebar, Logbook e comportamento de áreas/projetos.
- Recorrência avançada está implementada; assistente de IA e MCP permanecem opcionais e ainda não implementados.
- Sincronização de dispositivos via servidor central: a mesma base SQLite atende todos os clientes conectados; não é necessário implementar um protocolo de sincronização entre bancos locais no MVP.

Recursos de assinatura, limites comerciais e planos Basic/Pro não se aplicam ao uso pessoal inicial e ficam fora do escopo. Colaboração e compartilhamento de listas também ficam fora do MVP.

## Estratégia de testes

Toda feature deve incluir seus testes na mesma branch de implementação; não acumular os testes para o final.

- **Unitários:** regras do domínio GTD, transições de estado, Focus, prazos, início/agendamento, recorrência, validação e ordenação.
- **Integração SQLite:** migrações, constraints, transações, relações, filtros, busca FTS, histórico e preservação dos dados.
- **Autenticação e segurança:** criação de conta única, tentativas inválidas, expiração/revogação de sessão, cookies e acesso a rotas privadas.
- **Backup e recuperação:** execução no boot e no intervalo, retenção, falha recuperável, integridade e restauração completa.
- **Ponta a ponta:** captura, clarificação, mover itens, criar projetos, filtrar, Focus, revisão semanal, conclusão e restauração.
- **Interface:** navegadores desktop e mobile, responsividade, atalhos de teclado, formulários acessíveis e instalação PWA quando disponível.
- **Regressão:** executar testes e typecheck para cada feature; build de produção em mudanças de infraestrutura e antes de releases.

## Definição de concluído

Uma feature só está concluída quando:

- O comportamento está implementado e segue a semântica GTD documentada.
- Testes unitários, integração e/ou ponta a ponta apropriados foram adicionados e passam.
- `npm test`, `npm run check` e os demais comandos aplicáveis passam sem erros.
- A interface funciona em tamanhos de tela previstos e apresenta estados vazios, erros e carregamento relevantes.
- Dados existentes continuam compatíveis; mudanças de schema têm migração e cobertura de teste.
- A documentação de configuração ou operação é atualizada quando necessário.
- O trabalho está numa branch Git Flow de feature e foi revisto antes de integrar em `develop`.

## Fluxo de trabalho Git

- `main` contém versões estáveis.
- `develop` integra features prontas para validação.
- Cada feature futura é implementada em `feature/<nome-curto>`, criada a partir de `develop`.
- Correções urgentes de produção podem usar `hotfix/<nome-curto>` criada a partir de `main`.
- Preparação de releases pode usar `release/<versão>` quando houver implantação contínua definida.
- Manter commits claros e assinados conforme a configuração local do Git.
- Não integrar feature com testes relevantes falhando; após revisão, integrar a branch de feature em `develop`.

## Dependências e decisões ainda abertas

- Implantar na máquina de produção conforme `docs/OPERACAO.md`: configurar distribuição/usuário, hostname e VPN, HTTPS/certificados, destino e política de retenção externa de backups; testar restauração em instalação limpa.
- Se email entrar no escopo, escolher serviço de recebimento e envio.
- Se IA/MCP entrar no escopo, decidir provedor e limites de acesso aos dados antes de implementar.
- Usar `template/` como referência funcional e visual do usuário; resolver ambiguidades de comportamento durante a implementação, sem exigir reprodução literal da identidade visual capturada.

## Fontes consultadas

- [Nirvana — Quick Guide](https://www.nirvanahq.com/help/quick-guide)
- [Nirvana — Features](https://www.nirvanahq.com/features)
- [Nirvana — Help Center](https://www.nirvanahq.com/help)

- Página do projeto: exibição padrão compacta (checkbox, título, seta); clicar no título ou na seta abre o editor detalhado (Salvar/Cancelar). Itens podem ser arrastados para a barra lateral.

- Objetivos (migração 5): tabelas `goals` e `goal_links` (vínculo com ação ou projeto). Sidebar abaixo de Projetos, páginas `/goals` e `/goals/[id]`, `GoalPicker` nos editores de ação e projeto. Lógica em `src/lib/gtd/goals.ts`.
- Objetivos podem ter uma área (migração 9); a área aparece na lista e no detalhe com a cor configurada. O filtro global de área também filtra objetivos no menu lateral e em `/goals`.
- Próximas/Depois: em projetos paralelos só as 3 primeiras ações aparecem, com "Mostrar mais N ação(ões)" / "Mostrar menos" (`limitPerProject` em `ItemList.svelte`).
- Kanban (migração 6): tabelas `boards`, `board_columns`, `board_cards`; vários quadros salvos, na barra lateral acima de Projetos. Agrupamento por estado, projeto, área ou colunas personalizadas; colunas renomeáveis; filtro por projeto; mover por arrastar ou seletor. Lógica em `src/lib/gtd/kanban.ts`, páginas `/kanban` e `/kanban/[id]`.

### Complemento — Visualizações e cor de área

- Calendário e Kanban ficam agrupados em "Visualizações" na barra lateral. Cada área pode ter uma cor de destaque (migração 7), mostrada como faixa nas linhas de item e ao lado do filtro de área.
- Projetos em "Depois" ou "Algum dia" são inativos: aparecem em "Projetos (inativos)" nas listas Depois e Algum dia e, na barra lateral, após os ativos, com o link "mostrar/ocultar projetos inativos" (preferência local). Limite de 10 ações por grupo de estado na página do projeto; a revisão semanal permite adicionar a próxima ação inline.
- "Gerenciar tags…" (⚙) abre um diálogo com abas Áreas/Contatos/Contextos: criar, renomear, excluir e escolher cor (migração 8 adiciona `color` a tags e contatos). A área de itens e projetos não tem mais seletor próprio: digite o nome da área no campo de tags (`resolveTagField`). Nos campos de tags: `@` pessoa, `!` área, `#` contexto (sem prefixo mostra tudo); nomes novos são criados no salvar (`resolveTagField`, componente `TagInput`).
- As tags de contexto na lateral usam a cor configurada. Objetivos podem ter apenas uma área, definida por `!` no campo de tags; a cor da área aparece no chip do objetivo.
