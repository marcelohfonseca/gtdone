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

### Fase 0 — Fundação e operação

**Implementado**

- Repositório Git criado e branch ativa `feature/fase0-fundacao`; como foi inicializado sem commits-base, os ponteiros `main` e `develop` ainda precisam ser ancorados antes de iniciar a próxima feature.
- Scaffolding SvelteKit com TypeScript, Vitest e adapter-node.
- Camada SQLite com WAL, foreign keys e migração versionada inicial.
- Schema inicial para usuários, sessões, itens, projetos, áreas, tags, contatos, checklists, recorrências e preferências.
- Conta única inicial, hash de senha com scrypt, autenticação, sessão por cookie e logout.
- Proteção de rotas e páginas iniciais `/setup`, `/login` e home protegida.
- Backup usando `VACUUM INTO`, retenção e teste de restauração.
- Backup automático no boot de produção e a cada 24 horas; variáveis `GTDONE_DB_PATH`, `GTDONE_BACKUP_DIR` e `GTDONE_BACKUP_KEEP`.
- Testes automatizados para banco, autenticação, sessões, backup e agendamento.

**Pendente para completar a fundação**

- HTTPS dentro da VPN e ativação do atributo `secure` do cookie de sessão.
- Ancorar `main` e `develop` no histórico inicial para completar a estrutura de branches Git Flow antes de abrir outras branches de feature.
- Serviço de inicialização e reinício automático na máquina (por exemplo, systemd); configurar usuário e permissões dedicados.
- Fazer backup para outro dispositivo ou armazenamento protegido, definir política de retenção externa e documentar o procedimento de restauração.
- Verificar integridade dos backups com abertura do banco e `PRAGMA integrity_check`, além do teste de restauração já existente.
- Limitar tentativas de login e revisar a invalidação e a duração das sessões.
- Configurar logs operacionais sem registrar senhas, tokens ou conteúdo privado das tarefas.
- Documentar configuração da VPN, endereço HTTPS, variáveis de ambiente e recuperação após falha.

**Critério de saída:** a máquina inicia o serviço automaticamente, aceita acesso HTTPS somente pela VPN, cria backups locais e externos e permite restaurar os dados numa instalação limpa.

### Fase 1 — Captura e clarificação

- **Implementado (concluído):** shell com sidebar (Inbox, Next, Later, Waiting, Scheduled, Someday, Focus, projetos, tags, Logbook, Trash), barra superior (seletor de área, Novo item com atalhos I/X/L/W/S/Y/F/P/G, busca `/`, configurações), captura rápida por lista (Enter cria, Esc limpa), linhas com conclusão/estrela/menu/reordenação (arrastar ou Subir/Descer), detalhe inline do item, dica de dois minutos na Inbox, Logbook e Trash com restauração, projetos com página própria; persistência em SQLite (migração v3).
- Histórico: versão inicial com Inbox, edição, referência, projetos e atalhos.
- Completar o shell indicado pelos templates: navegação lateral para todas as listas, projetos, áreas/tags, Logbook e Trash; barra superior com seletor de área, criação rápida, busca e preferências.
- Tornar a captura rápida de uma linha disponível nas listas, permitindo criar itens em sucessão com Enter e cancelar com Escape; o destino inicial acompanha a lista atual.
- Apresentar itens como linhas com conclusão, inclusão/remoção da Focus, notas, menu de ações e reordenação manual; suportar modos de densidade/lista sem alterar os dados.
- Implementar detalhe de item que permita atualizar título e notas e encaminhar à lista correta sem perder metadados.
- Oferecer orientação de clarificação, incluindo a pergunta sobre trabalho que leva menos de dois minutos, sem impor que a tarefa seja executada no app.
- Preservar conteúdo e estado após navegação, refresh e reinício do servidor.

**Critério de saída:** o shell de navegação e os fluxos de captura/clarificação funcionam sem perda de conteúdo; as ações rápidas de teclado não interceptam digitação em campos.

### Fase 2 — Organização e dados de ação

- **Implementado:** CRUD de áreas, tags e contatos (`/manage/<tipo>`); área, tags, contato delegado, tempo e energia no item; início e prazo independentes (Scheduled vira Next na data); reordenação persistente; referências distintas; estado do projeto (ativo/Later/Scheduled/Someday) com data própria; seletor de área global (cookie) e filtro por tag.
- **Adiado:** filtros por tempo/energia (Fase 3), preferência para ocultar itens sem área, modos de densidade, execução sequencial/paralela de projetos (Fase 4), exclusão permanente e retenção do Logbook.
- Criar/administrar tags e contextos e associá-los a itens e projetos; criar áreas e contatos com gerenciamento e seleção a partir dos detalhes.
- Implementar associação de área, tags e contato delegado no item; o seletor de área global filtra listas e pode manter itens sem área visíveis conforme preferência.
- Registrar tempo estimado e energia, com filtros e apresentação no detalhe/linha do item.
- Tratar data de início/agendamento e deadline como conceitos independentes; Scheduled não se torna executável antes do início.
- Adicionar reordenação persistente por posição, preservando a ordenação manual ao mover itens.
- Distinguir referências de tarefas nas listas e preservar notas/dados compatíveis nas conversões.
- Adicionar estado de projeto independente do estado da tarefa: ativo, Later, Scheduled ou Someday; estado e data do projeto não devem ser confundidos com os de suas ações.
- Criar migrações aditivas para os novos campos/relações e preservar dados existentes.

**Critério de saída:** itens podem ser organizados sem perder a semântica GTD, e início e prazo final comportam-se como conceitos separados.

### Fase 3 — Engajar, Focus, filtros e busca

- **Implementado:** Focus = estrela (manual) + próximas vencidas ou com prazo hoje (automático), agrupado em "Vencidas e para hoje", "Em foco" e "Algum dia — vale revisar" sem alterar o estado original; filtros combináveis na URL (energia, tempo disponível, contato, projeto, tag, prazo, área) com chips removíveis e "Limpar"; ordenação por prazo; busca por título, notas, projeto e tag (LIKE; itens sem estimativa de tempo continuam visíveis no filtro de tempo); contagens e badge de atrasadas na barra lateral; "ações possíveis" via filtros de energia/tempo/tag na lista Próximas.
- **Adiado:** FTS5 (LIKE basta no volume atual), filtro por intervalo de início, modos de densidade (Fase 5).
- Implementar Focus com marcação manual e itens relevantes por regras explícitas de data; distinguir inclusão manual da relevância automática e permitir remover da Focus.
- Organizar a visão de Focus por grupos úteis, como próximas ações e itens Someday que merecem revisão, sem alterar o estado original.
- Implementar filtros combináveis por lista, área, tag/contexto, contato, energia, tempo, início, deadline e projeto; mostrar filtros ativos como chips removíveis.
- Implementar busca global em títulos e notas, inicialmente com SQLite FTS5 quando adequado.
- Oferecer ordenação por prazo, agrupamento e modos de densidade/lista; exibir atrasos e contagens de atenção sem tratar deadline como data de início.
- Exibir contagens por lista e um filtro global de áreas, com opção de incluir itens sem área.
- Criar visão de ações possíveis por contexto, energia e tempo disponível.

**Critério de saída:** o usuário consegue selecionar ações possíveis para o contexto atual e encontra itens por texto e metadados.

### Fase 4 — Projetos, revisão e encerramento

- **Implementado:** lista de projetos (`/projects`) por estado com destaque "sem próxima ação"; detalhe com ações agrupadas por estado (Próximas ações, Aguardando, Depois…, Concluídas); modo sequencial/paralelo por projeto (migração v4; no sequencial só a primeira ação aberta aparece em Próximas e Foco); concluir e reabrir projetos (Diário lista projetos concluídos); revisão semanal guiada em `/review` (Inbox, projetos, Próximas, Aguardando, Agendadas, Algum dia); retenção do Diário configurável em `/settings` (0 = guardar tudo); exclusão definitiva individual e "Esvaziar lixeira" com confirmação; seleção múltipla (concluir, mover, tag, Foco, excluir, restaurar).
- **Adiado:** enviar projeto à lixeira, edição em lote de datas/energia, retenção também para projetos concluídos.
- Exibir lista de projetos e detalhe com resultado desejado, notas, tags/área e ações agrupadas por estado, incluindo a seção de próxima ação.
- Implementar modo sequencial (só a próxima ação fica disponível) e paralelo (ações podem avançar independentemente); persistir o modo por projeto.
- Permitir encaminhar projetos para Later, Scheduled e Someday e reativá-los sem perder ações ou histórico.
- Destacar projetos ativos sem próxima ação para facilitar a revisão.
- Criar fluxo guiado de revisão semanal que percorra Inbox, projetos, Next, Waiting, Scheduled e Someday.
- Registrar conclusão sem apagar o histórico; itens concluídos aparecem no Logbook, cuja retenção/frequência de coleta é configurável.
- Implementar lixeira com restauração e exclusão permanente explícita.
- Suportar seleção múltipla para mover, etiquetar, concluir e editar vários itens.
- Permitir revisão de tarefas concluídas relacionadas a projetos sem fazê-las reaparecer como ações abertas.

**Critério de saída:** o app suporta o ciclo capturar, esclarecer, organizar, refletir e engajar, mantendo histórico recuperável.

### Fase 5 — Recursos avançados e fluidez

- **Implementado:** checklists por item (editor + progresso ☑ n/m na linha); recorrência diária/semanal/mensal/anual a cada N (ao concluir, a próxima ocorrência é criada uma única vez e a regra migra para ela; exige data); links http(s) nas notas listados no editor; duplicar item (menu e `D`); atalhos de teclado (`1–9/0` navegação, `J/K`, `Enter`, `C`, `*`, `T`, `D`, `Delete`, `?` ajuda; lista também em Preferências › Atalhos); página Referência (`/reference`) com criação, busca e conversão; Preferências com 5 abas + Atalhos, salvas automaticamente na tabela `settings` (`pref.*`): tema, cor de destaque, densidade, formato de data, início da semana, prazos relativos/absolutos, entrada rápida, concluídos ao fim, contadores, posição do Foco, Depois/Aguardando, projetos sequenciais na barra, atribuir área ao sair da Entrada, itens sem área sob filtro, retenção do Diário.
- **Adiado:** outros idiomas (UI só em português), links clicáveis dentro da própria linha de notas, recorrência por dias da semana/“após conclusão”, fim de recorrência.

- Adicionar checklists vinculadas a tarefas e outros itens compatíveis.
- Implementar tarefas recorrentes com geração previsível e sem duplicação acidental.
- Adicionar links nas notas.
- Implementar duplicação e cópia de tarefas.
- Completar atalhos de teclado para listas e destinos de criação, busca, Focus, conclusão e gerenciamento de tags; documentar os atalhos na interface.
- Adicionar entrada rápida e operações de lote.
- Criar listas de referência com itens próprios, busca e conversão de itens existentes.
- Implementar preferências persistidas: tema claro/escuro/sistema, paleta de destaque e densidade; idioma e formato de data, primeiro dia da semana, apresentação de vencimentos, exibição da captura rápida, retenção do Logbook, posição da Focus, visibilidade de Later/Waiting, contagens da sidebar e opções de área/projeto.

**Critério de saída:** tarefas repetitivas, checklists e navegação rápida funcionam em desktop, sem degradar os fluxos móveis.

### Fase 6 — Portabilidade e integrações

- **Implementado:** exportação JSON completa (`/settings/export`; todas as tabelas de dados, exceto conta, sessões e segredos de integração); importação com validação estrutural (formato, versão do schema, colunas, tipos, obrigatórios, integridade referencial), modo "só validar", substituição atômica e backup automático antes; copiar lista (markdown) e imprimir, com CSS de impressão; captura por email via webhook `POST /api/inbound-email` (JSON, token Bearer guardado só como hash, lista de remetentes obrigatória, padrão = rejeitar); email periódico do Foco (dias/horário/destinatário em Preferências › Dados e integrações, SMTP por `GTDONE_SMTP_URL` + `GTDONE_MAIL_FROM`, até 3 tentativas/dia a cada 15 min, último erro visível, botão de teste).
- **Avaliado e adiado:** assistente de IA e MCP. Só entram com consentimento explícito por recurso, escopo de leitura/escrita por lista, aviso do que é enviado ao provedor e registro de uso; ficam para depois de definir provedor.
- **Limitações:** o serviço de recebimento de email é externo (o app não abre porta SMTP); o campo "From" pode ser forjado, por isso o token é a proteção principal; importar exige mesma versão de schema do arquivo.

- Exportar dados, incluindo itens ativos, projetos, notas, referências, relações e histórico relevante.
- Importar um arquivo exportado e validar os dados antes de modificar o banco.
- Oferecer cópia para clipboard e impressão de listas.
- Capturar tarefas para Inbox por email, com assunto como título e corpo como notas; definir serviço de recebimento e proteção contra remetentes não autorizados.
- Enviar email periódico da lista Focus nos dias e horários configurados; definir SMTP ou serviço de envio e política de falhas.
- Avaliar assistente de IA e integração MCP como recursos opcionais posteriores, com controle explícito de permissões e divulgação de dados enviados a serviços externos.

**Critério de saída:** dados podem ser movidos e recursos que dependem de serviços externos têm configuração segura, documentada e testada.

### Complemento — Idioma e preferências de interface

- Preferência **Idioma** (pt-BR padrão, en-US) em Idioma e região; `<html lang>` e `data-*` de tema/densidade são aplicados no servidor (`hooks.server.ts`) e de forma otimista ao alterar.
- Preferência **Referência** (mostrar/ocultar) na barra lateral; oculta também o atalho `9`.
- i18n: o texto em português é a chave; dicionários em `src/lib/i18n/en-*.ts`; componentes usam `useT()`. Limites: login/setup e o email do Foco permanecem em português.

### Complemento — Calendário em "Agendadas"

- A página Agendadas agora é um calendário de todo item aberto com prazo ou data de início, com cinco visões: Prazos (agenda sem dias vazios, atrasadas no topo), 3 dias, Semanal, Mensal e 7 dias a partir de hoje. Visão e data ficam na URL; cada visão consulta só o seu intervalo, via índices de data.

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
- Recorrência, assistente de IA e MCP como capacidades posteriores e opcionais.
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
- Cada feature futura é implementada em `feature/<nome-curto>`, criada a partir de `develop`; primeiro ancorar `main` e `develop` no histórico existente.
- Correções urgentes de produção podem usar `hotfix/<nome-curto>` criada a partir de `main`.
- Preparação de releases pode usar `release/<versão>` quando houver implantação contínua definida.
- Manter commits claros e assinados conforme a configuração local do Git.
- Não integrar feature com testes relevantes falhando; após revisão, integrar a branch de feature em `develop`.

## Dependências e decisões ainda abertas

- Escolher a distribuição Linux e o método de execução do serviço na máquina (systemd recomendado para instalação nativa).
- Escolher a solução de HTTPS para o hostname da VPN e então habilitar cookies `secure`.
- Escolher o destino externo de backups e a forma de criptografia e retenção dessas cópias.
- Definir política de limite de tentativas e recuperação da conta sem comprometer a instalação pessoal.
- Se email entrar no escopo, escolher serviço de recebimento e envio.
- Se IA/MCP entrar no escopo, decidir provedor e limites de acesso aos dados.
- Usar `template/` como referência funcional e visual do usuário; resolver ambiguidades de comportamento durante a implementação, sem exigir reprodução literal da identidade visual capturada.

## Fontes consultadas

- [Nirvana — Quick Guide](https://www.nirvanahq.com/help/quick-guide)
- [Nirvana — Features](https://www.nirvanahq.com/features)
- [Nirvana — Help Center](https://www.nirvanahq.com/help)

- Página do projeto: exibição padrão compacta (checkbox, título, seta); clicar no título ou na seta abre o editor detalhado (Salvar/Cancelar). Itens podem ser arrastados para a barra lateral.

- Objetivos (migração 5): tabelas `goals` e `goal_links` (vínculo com ação ou projeto). Sidebar abaixo de Projetos, páginas `/goals` e `/goals/[id]`, `GoalPicker` nos editores de ação e projeto. Lógica em `src/lib/gtd/goals.ts`.
- Próximas/Depois: em projetos paralelos só as 3 primeiras ações aparecem, com "Mostrar mais N ação(ões)" / "Mostrar menos" (`limitPerProject` em `ItemList.svelte`).
