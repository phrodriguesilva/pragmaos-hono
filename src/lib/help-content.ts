// Help content for the in-app help panel.
// Organized by category, each with articles.
// Edit this file to add/update help content.
//
// PragmaOS 2.

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string; // HTML content
}

export interface HelpCategory {
  slug: string;
  name: string;
  icon: string; // Phosphor icon name
  description: string;
}

export const helpCategories: HelpCategory[] = [
  {
    slug: "primeiros-passos",
    name: "Primeiros Passos",
    icon: "ph-rocket",
    description: "Onboarding e configuracao inicial do escritorio.",
  },
  {
    slug: "processos",
    name: "Processos e Casos",
    icon: "ph-folder",
    description: "Gestao de casos, processos, prazos e audiencias.",
  },
  {
    slug: "financeiro",
    name: "Financeiro",
    icon: "ph-currency-dollar",
    description: "Honorarios, cobrancas, fluxo de caixa e relatorios.",
  },
  {
    slug: "comunicacao",
    name: "Comunicacao",
    icon: "ph-chat-circle",
    description: "WhatsApp, e-mails, intimações e notificacoes.",
  },
  {
    slug: "documentos",
    name: "Documentos",
    icon: "ph-file-text",
    description: "Modelos, assinaturas, OCR e versionamento.",
  },
  {
    slug: "ia",
    name: "Inteligencia Artificial",
    icon: "ph-brain",
    description: "Chat juridico, resumos e analises com IA.",
  },
  {
    slug: "integracoes",
    name: "Integracoes",
    icon: "ph-plugs-connected",
    description: "Gov.br, intima.ai, ClickSign, DocuSign e API.",
  },
  {
    slug: "admin",
    name: "Administracao",
    icon: "ph-gear",
    description: "Usuarios, permissoes, configuracoes do escritorio.",
  },
];

export const helpArticles: HelpArticle[] = [
  // Primeiros Passos
  {
    slug: "primeiro-cliente",
    title: "Como cadastrar seu primeiro cliente",
    category: "primeiros-passos",
    excerpt: "Passo a passo para criar um cliente e vincular a um caso.",
    body: `
      <h3>1. Acesse CRM > Clientes</h3>
      <p>No menu lateral, clique em <strong>CRM</strong> > <strong>Clientes</strong>.</p>

      <h3>2. Clique em "Novo Cliente"</h3>
      <p>Botao verde no canto superior direito.</p>

      <h3>3. Preencha os dados</h3>
      <ul>
        <li><strong>Nome</strong>: nome completo do cliente</li>
        <li><strong>CPF/CNPJ</strong>: opcional, mas recomendado para verificacao de conflito de interesses</li>
        <li><strong>E-mail e telefone</strong>: para comunicacoes e notificacoes WhatsApp</li>
      </ul>

      <h3>4. Salve</h3>
      <p>O cliente estara disponivel para vincular a casos.</p>
    `,
  },
  {
    slug: "configurar-whatsapp",
    title: "Como configurar o WhatsApp",
    category: "primeiros-passos",
    excerpt: "Integracao com WhatsApp Business API para enviar mensagens aos clientes.",
    body: `
      <h3>1. Obtenha uma conta WhatsApp Business API</h3>
      <p>Use um provedor como Meta Business, Zenvia, ou Wati.</p>

      <h3>2. Acesse Integracoes</h3>
      <p>No menu, va em <strong>Integracoes</strong> e clique em "Nova Integracao".</p>

      <h3>3. Configure o tipo WhatsApp</h3>
      <ul>
        <li><strong>Token da API</strong>: fornecido pelo provedor</li>
        <li><strong>Numero do remetente</strong>: numero cadastrado no WhatsApp Business</li>
        <li><strong>Webhook URL</strong>: configure no provedor para receber mensagens</li>
      </ul>

      <h3>4. Teste</h3>
      <p>Envie uma mensagem de teste pela ficha do cliente.</p>
    `,
  },
  {
    slug: "importar-dados",
    title: "Como importar dados de outro sistema",
    category: "primeiros-passos",
    excerpt: "Importe clientes e processos de CSV/Excel (Astrea, Projuris, CPJ).",
    body: `
      <h3>1. Acesse Importar > Clientes ou Processos</h3>
      <p>No menu, va em <strong>Importar</strong>.</p>

      <h3>2. Faca upload do arquivo CSV</h3>
      <p>O sistema aceita CSV com cabecalho. Faca o download do template para garantir o formato correto.</p>

      <h3>3. Mapeie as colunas</h3>
      <p>O sistema tenta mapear automaticamente. Confira e ajuste o mapeamento de cada coluna.</p>

      <h3>4. Preview e importe</h3>
      <p>Verifique os dados no preview e confirme a importacao. Registros com erro serao listados para correcao.</p>
    `,
  },

  // Processos
  {
    slug: "criar-caso",
    title: "Como criar um novo caso",
    category: "processos",
    excerpt: "Cadastro de casos, vinculacao a cliente e processo judicial.",
    body: `
      <h3>1. Acesse Processos > Casos</h3>
      <p>Clique em "Novo Caso".</p>

      <h3>2. Preencha os dados</h3>
      <ul>
        <li><strong>Titulo</strong>: nome interno do caso</li>
        <li><strong>Cliente</strong>: selecione o cliente vinculado</li>
        <li><strong>Numero CNJ</strong>: numero do processo (opcional, mas habilita integracoes)</li>
        <li><strong>Area</strong>: area do direito (civel, trabalhista, etc.)</li>
      </ul>

      <h3>3. Adicione movimentacoes</h3>
      <p>Apos criar, registre andamentos na aba "Movimentacoes".</p>
    `,
  },
  {
    slug: "calcular-prazos",
    title: "Como calcular prazos processuais",
    category: "processos",
    excerpt: "Calculo de prazos conforme CPC/2015 com feriados e recesso.",
    body: `
      <h3>1. Acesse Processos > Calc. de Prazos</h3>

      <h3>2. Informe os parametros</h3>
      <ul>
        <li><strong>Data de inicio</strong>: data da intimacao</li>
        <li><strong>Prazo em dias</strong>: numero de dias uteis</li>
        <li><strong>Tribunal/Comarca</strong>: para considerar feriados locais</li>
      </ul>

      <h3>3. Calcule</h3>
      <p>O sistema calcula a data limite considerando feriados nacionais, estaduais e recesso forense (20/12 a 20/01).</p>
    `,
  },

  // Financeiro
  {
    slug: "registrar-honorarios",
    title: "Como registrar honorarios",
    category: "financeiro",
    excerpt: "Lancamento de honorarios contratuais e exito.",
    body: `
      <h3>1. Acesse Financeiro > Honorarios</h3>
      <p>Clique em "Novo Honorario".</p>

      <h3>2. Selecione o tipo</h3>
      <ul>
        <li><strong>Contratual</strong>: pagamento recorrente ou fixo</li>
        <li><strong>Exito</strong>: percentual ou valor fixo apos sentenca/acordo</li>
      </ul>

      <h3>3. Vincule ao caso</h3>
      <p>Selecione o caso e o cliente. O valor sera incluido na analise de rentabilidade.</p>
    `,
  },
  {
    slug: "gerar-cobranca",
    title: "Como gerar cobrancas (faturas)",
    category: "financeiro",
    excerpt: "Criacao de faturas com PIX e controle de pagamentos.",
    body: `
      <h3>1. Acesse Financeiro > Cobrancas</h3>
      <p>Clique em "Nova Cobranca".</p>

      <h3>2. Preencha</h3>
      <ul>
        <li><strong>Cliente</strong>: destinatario</li>
        <li><strong>Valor</strong>: valor em reais</li>
        <li><strong>Vencimento</strong>: data de vencimento</li>
        <li><strong>Chave PIX</strong>: configurada no perfil do escritorio</li>
      </ul>

      <h3>3. Envie</h3>
      <p>Apos gerar, voce pode enviar a fatura por WhatsApp ou e-mail diretamente do sistema.</p>
    `,
  },

  // Comunicacao
  {
    slug: "notificacoes-whatsapp",
    title: "Notificacoes proativas via WhatsApp",
    category: "comunicacao",
    excerpt: "Como configurar envio automatico de movimentacoes aos clientes.",
    body: `
      <h3>O que sao</h3>
      <p>Quando uma nova movimentacao e registrada, a IA traduz o juridiques para linguagem simples e envia ao cliente via WhatsApp.</p>

      <h3>Como ativar</h3>
      <ol>
        <li>Acesse <strong>IA > Notificacoes Proativas</strong></li>
        <li>Ative a funcionalidade</li>
        <li>Configure quais tipos de movimentacao disparam notificacao</li>
        <li>Defina o horario de envio (evita mensagens fora de horario comercial)</li>
      </ol>

      <h3>Opt-out</h3>
      <p>Clientes podem pedir para parar de receber notificacoes. O sistema respeita opt-out automaticamente.</p>
    `,
  },

  // Documentos
  {
    slug: "versionamento-documentos",
    title: "Versionamento de documentos",
    category: "documentos",
    excerpt: "Como manter historico de versoes e restaurar versoes anteriores.",
    body: `
      <h3>Como funciona</h3>
      <p>Cada upload de uma nova versao de documento cria um registro no historico. Voce pode baixar ou restaurar qualquer versao anterior.</p>

      <h3>Como usar</h3>
      <ol>
        <li>Abra o documento desejado</li>
        <li>Acesse a aba "Versoes"</li>
        <li>Faca upload de uma nova versao com resumo da alteracao</li>
        <li>Para restaurar: clique em "Restaurar" na versao desejada</li>
      </ol>
    `,
  },
  {
    slug: "ocr-documentos",
    title: "OCR em documentos escaneados",
    category: "documentos",
    excerpt: "Como extrair texto de PDFs escaneados para busca.",
    body: `
      <h3>O que e OCR</h3>
      <p>OCR (Optical Character Recognition) extrai texto de imagens e PDFs escaneados, tornando o conteudo pesquisavel.</p>

      <h3>Como usar</h3>
      <ol>
        <li>Abra o documento escaneado</li>
        <li>Clique em "Executar OCR"</li>
        <li>O texto extraido aparecera no campo "Texto Extraido"</li>
        <li>Apos a extracao, o documento aparece na busca full-text</li>
      </ol>

      <h3>Configuracao</h3>
      <p>Para usar OCR, e necessario configurar uma integracao de OCR (Google Vision, AWS Textract) em <strong>Integracoes</strong>.</p>
    `,
  },

  // IA
  {
    slug: "chat-juridico",
    title: "Chat juridico com IA",
    category: "ia",
    excerpt: "Como usar o assistente de IA para perguntas juridicas.",
    body: `
      <h3>1. Acesse IA > Chat</h3>

      <h3>2. Faca sua pergunta</h3>
      <p>O assistente usa o contexto dos seus casos para responder. Pergunte sobre jurisprudencia, doutrina, ou peças processuais.</p>

      <h3>3. Streaming</h3>
      <p>A resposta aparece token a token (streaming), reduzindo a percepcao de lentidao.</p>

      <h3>Importante</h3>
      <p>A IA nao substitui a analise de um advogado. Use como ferramenta de apoio. Dados sensiveis (PII) sao mascarados antes de enviar para a IA.</p>
    `,
  },
  {
    slug: "resumos-automaticos",
    title: "Resumos automaticos de casos",
    category: "ia",
    excerpt: "Geracao de resumos de casos com IA.",
    body: `
      <h3>Como gerar</h3>
      <ol>
        <li>Abra o caso desejado</li>
        <li>Clique em "Gerar Resumo com IA"</li>
        <li>O sistema analisa movimentacoes e gera um resumo</li>
      </ol>

      <h3>Atualizacao</h3>
      <p>Voce pode regenerar o resumo a qualquer momento para incluir novas movimentacoes.</p>
    `,
  },

  // Integracoes
  {
    slug: "govbr",
    title: "Login com Gov.br",
    category: "integracoes",
    excerpt: "Como configurar autenticacao via Gov.br.",
    body: `
      <h3>1. Obtenha as credenciais Gov.br</h3>
      <p>Acesse o portal de desenvolvedores do Gov.br e crie uma aplicacao.</p>

      <h3>2. Configure no PragmaOS</h3>
      <p>Defina as variaveis de ambiente GOVBR_CLIENT_ID, GOVBR_CLIENT_SECRET e GOVBR_REDIRECT_URL.</p>

      <h3>3. Teste</h3>
      <p>Na tela de login, clique em "Entrar com Gov.br".</p>
    `,
  },
  {
    slug: "intima-ai",
    title: "Intimacoes eletronicas via intima.ai",
    category: "integracoes",
    excerpt: "Como configurar captura automatica de intimacoes.",
    body: `
      <h3>1. Obtenha o token intima.ai</h3>
      <p>Crie uma conta no intima.ai e obtenha o token de API.</p>

      <h3>2. Configure em Integracoes</h3>
      <p>Crie uma integracao do tipo "intima.ai" e informe o token.</p>

      <h3>3. Vincule processos</h3>
      <p>Processos com numero CNJ serao monitorados automaticamente.</p>
    `,
  },

  // Admin
  {
    slug: "gerenciar-usuarios",
    title: "Gerenciar usuarios e permissoes",
    category: "admin",
    excerpt: "Como adicionar usuarios e definir roles.",
    body: `
      <h3>Roles disponiveis</h3>
      <ul>
        <li><strong>admin</strong>: acesso total</li>
        <li><strong>socio</strong>: acesso a financeiro, jurimetria, docs tecnicas</li>
        <li><strong>advogado</strong>: acesso a casos, clientes, documentos</li>
        <li><strong>paralegal</strong>: acesso limitado a casos e documentos</li>
        <li><strong>financeiro</strong>: acesso apenas ao modulo financeiro</li>
      </ul>

      <h3>Como adicionar</h3>
      <ol>
        <li>Acesse <strong>Administracao > Equipe</strong></li>
        <li>Clique em "Novo Usuario"</li>
        <li>Preencha nome, e-mail e role</li>
      </ol>
    `,
  },
  {
    slug: "jurimetria",
    title: "Jurimetria interna",
    category: "admin",
    excerpt: "Como usar estatisticas de exito do escritorio.",
    body: `
      <h3>O que e</h3>
      <p>Jurimetria interna analisa dados dos seus proprios casos: taxa de exito, duracao media, distribuicao por area, etc.</p>

      <h3>Como acessar</h3>
      <p>Acesse <strong>Financeiro > Jurimetria</strong>. Acesso restrito a socios e admins.</p>

      <h3>Filtros</h3>
      <p>Use os filtros de area e advogado para segmentar a analise.</p>
    `,
  },
  {
    slug: "api-keys",
    title: "API keys e webhooks",
    category: "admin",
    excerpt: "Como criar API keys para integracoes externas e configurar webhooks.",
    body: `
      <h3>API Keys</h3>
      <ol>
        <li>Acesse <strong>Administracao > API e Webhooks</strong></li>
        <li>Clique em "Nova API Key"</li>
        <li>Selecione os escopos necessarios (cases:read, cases:write, clients:read, etc.)</li>
        <li>Defina uma data de expiracao (recomendado)</li>
        <li>Copie a chave — ela nao sera mostrada novamente</li>
      </ol>

      <h3>Webhooks</h3>
      <p>Webhooks sao chamadas HTTP que o PragmaOS faz para seu endpoint quando eventos acontecem (novo caso, fatura paga, etc.).</p>
      <ol>
        <li>Acesse <strong>Administracao > API e Webhooks</strong></li>
        <li>Clique em "Novo Webhook"</li>
        <li>Informe a URL do seu endpoint</li>
        <li>Selecione os eventos que deseja receber</li>
        <li>O PragmaOS envia um header <code>X-PragmaOS-Signature</code> com HMAC para verificacao</li>
      </ol>
    `,
  },
  {
    slug: "intake-forms",
    title: "Formularios de intake",
    category: "admin",
    excerpt: "Como criar formularios publicos para captar novos clientes.",
    body: `
      <h3>O que sao</h3>
      <p>Formularios de intake sao links publicos que clientes potenciais preenchem. Os dados sao salvos como submissoes e podem ser convertidos em clientes/casos automaticamente.</p>

      <h3>Como criar</h3>
      <ol>
        <li>Acesse <strong>CRM > Intake Forms</strong></li>
        <li>Clique em "Novo Formulario"</li>
        <li>Defina titulo e descricao</li>
        <li>Adicione campos (texto, CPF, telefone, etc.)</li>
        <li>Mapeie cada campo para Cliente ou Caso</li>
        <li>Salve — voce recebera um link publico</li>
      </ol>

      <h3>Converter submissoes</h3>
      <p>Quando um cliente preenche o formulario, a submissao aparece na lista. Clique em "Converter" para criar automaticamente o cliente e o caso.</p>
    `,
  },
  {
    slug: "self-service-signup",
    title: "Cadastro self-service (novos escritorios)",
    category: "admin",
    excerpt: "Como novos escritorios se cadastram automaticamente.",
    body: `
      <h3>Como funciona</h3>
      <p>Novos escritorios podem se cadastrar diretamente na pagina /signup, sem intervencao manual. O sistema cria:</p>
      <ul>
        <li>Tenant (escritorio) com plano trial (14 dias)</li>
        <li>Usuario admin com acesso total</li>
        <li>Configuracoes padrao (timezone, moeda, locale)</li>
        <li>Tags iniciais (Prioritario, Complexidade)</li>
      </ul>

      <h3>Planos</h3>
      <ul>
        <li><strong>Trial</strong>: 14 dias gratis, ate 3 usuarios</li>
        <li><strong>Starter</strong>: R$ 199/mes, ate 10 usuarios</li>
        <li><strong>Pro</strong>: R$ 499/mes, ate 50 usuarios</li>
        <li><strong>Enterprise</strong>: sob consulta, usuarios ilimitados</li>
      </ul>
    `,
  },

  // Documentos — artigos adicionais
  {
    slug: "modelos-documento",
    title: "Modelos de documento",
    category: "documentos",
    excerpt: "Como criar e usar modelos reutilizaveis de documentos.",
    body: `
      <h3>Como criar um modelo</h3>
      <ol>
        <li>Acesse <strong>Documentos > Modelos</strong></li>
        <li>Clique em "Novo Modelo"</li>
        <li>Defina o nome e tipo (peticao, contrato, procuracao, etc.)</li>
        <li>Escreva o conteudo usando o editor</li>
        <li>Use variaveis como <code>{{cliente.nome}}</code>, <code>{{caso.numero}}</code> para preenchimento automatico</li>
      </ol>

      <h3>Como usar</h3>
      <p>Ao criar um documento, selecione um modelo como base. As variaveis serao preenchidas com os dados do caso/cliente.</p>
    `,
  },
  {
    slug: "assinaturas-eletronicas",
    title: "Assinaturas eletronicas (ClickSign/DocuSign)",
    category: "documentos",
    excerpt: "Como enviar documentos para assinatura via ClickSign ou DocuSign.",
    body: `
      <h3>1. Configure a integracao</h3>
      <p>Acesse <strong>Integracoes</strong> e configure ClickSign ou DocuSign com suas credenciais.</p>

      <h3>2. Envie para assinatura</h3>
      <ol>
        <li>Abra o documento desejado</li>
        <li>Clique em "Enviar para Assinatura"</li>
        <li>Selecione o provedor (ClickSign ou DocuSign)</li>
        <li>Informe os signatarios (e-mail)</li>
        <li>Envie — o signatario recebera um link por e-mail</li>
      </ol>

      <h3>3. Acompanhe o status</h3>
      <p>O status da assinatura aparece na lista de documentos. Webhooks atualizam o status automaticamente.</p>
    `,
  },
  {
    slug: "busca-documentos",
    title: "Busca full-text em documentos",
    category: "documentos",
    excerpt: "Como buscar dentro do conteudo de documentos (PDFs, textos).",
    body: `
      <h3>Como buscar</h3>
      <ol>
        <li>Acesse <strong>Documentos > Busca em Docs</strong></li>
        <li>Digite o termo de busca (minimo 2 caracteres)</li>
        <li>O sistema busca no titulo e no texto extraido dos documentos</li>
        <li>Resultados mostram snippets com o contexto do termo encontrado</li>
      </ol>

      <h3>Como o texto e extraido</h3>
      <p>PDFs com texto selecionavel tem o conteudo extraido no upload. PDFs escaneados precisam de OCR (veja o artigo sobre OCR).</p>
    `,
  },

  // Processos — artigos adicionais
  {
    slug: "audiencias",
    title: "Cadastro de audiencias",
    category: "processos",
    excerpt: "Como registrar audiencias e vinculalas a casos.",
    body: `
      <h3>1. Acesse Processos > Audiencias</h3>
      <p>Clique em "Nova Audiencia".</p>

      <h3>2. Preencha</h3>
      <ul>
        <li><strong>Caso</strong>: selecione o caso vinculado</li>
        <li><strong>Data e hora</strong>: quando ocorrera</li>
        <li><strong>Tipo</strong>: conciliacao, instrucao, julgamento, etc.</li>
        <li><strong>Local</strong>: vara, comarca ou link da audiencia online</li>
      </ul>

      <h3>3. Notificacoes</h3>
      <p>Audiencias aparecem no calendario e geram notificacoes automaticas.</p>
    `,
  },
  {
    slug: "prazos-deadlines",
    title: "Gestao de prazos e deadlines",
    category: "processos",
    excerpt: "Como registrar e acompanhar prazos processuais.",
    body: `
      <h3>Como registrar</h3>
      <ol>
        <li>Acesse <strong>Processos > Prazos</strong> ou abra um caso</li>
        <li>Clique em "Novo Prazo"</li>
        <li>Informe titulo, data e caso vinculado</li>
        <li>Marque a prioridade se necessario</li>
      </ol>

      <h3>Acompanhamento</h3>
      <p>Prazos proximos aparecem no dashboard com indicador de urgencia (vermelho = vencido, amarelo = proximo).</p>
    `,
  },

  // Financeiro — artigos adicionais
  {
    slug: "fluxo-caixa",
    title: "Fluxo de caixa",
    category: "financeiro",
    excerpt: "Como acompanhar entradas e saidas do escritorio.",
    body: `
      <h3>Como acessar</h3>
      <p>Acesse <strong>Financeiro > Fluxo de Caixa</strong>.</p>

      <h3>O que mostra</h3>
      <ul>
        <li>Entradas e saidas por mes</li>
        <li>Saldo projetado</li>
        <li>Cobrancas a receber (vencidas e a vencer)</li>
        <li>Despesas registradas</li>
      </ul>
    `,
  },
  {
    slug: "timesheet",
    title: "Timesheet (controle de horas)",
    category: "financeiro",
    excerpt: "Como registrar horas trabalhadas por caso.",
    body: `
      <h3>Como registrar</h3>
      <ol>
        <li>Acesse <strong>Financeiro > Timesheet</strong></li>
        <li>Clique em "Nova Entrada"</li>
        <li>Selecione o caso e a atividade</li>
        <li>Informe as horas (ou use o timer integrado)</li>
      </ol>

      <h3>Timer integrado</h3>
      <p>Use o timer para registrar horas em tempo real. Clique em iniciar ao comecar uma tarefa e parar ao terminar.</p>

      <h3>Relatorio de rentabilidade</h3>
      <p>As horas registradas alimentam o relatorio de rentabilidade por processo (Financeiro > Relatorios > Rentabilidade).</p>
    `,
  },
  {
    slug: "rentabilidade",
    title: "Analise de rentabilidade por processo",
    category: "financeiro",
    excerpt: "Cruzar horas gastas com honorarios recebidos por caso.",
    body: `
      <h3>O que e</h3>
      <p>O relatorio de rentabilidade cruza o tempo gasto (timesheet) com os honorarios recebidos por cada caso, mostrando lucro ou prejuizo.</p>

      <h3>Como acessar</h3>
      <ol>
        <li>Acesse <strong>Financeiro > Relatorios</strong></li>
        <li>Clique em "Rentabilidade por Processo"</li>
      </ol>

      <h3>Como interpretar</h3>
      <ul>
        <li><strong>Receita</strong>: honorarios recebidos do caso</li>
        <li><strong>Custo</strong>: horas gastas x custo horario do advogado</li>
        <li><strong>Margem</strong>: receita - custo</li>
        <li>Casos com margem negativa indicam baixa eficiencia</li>
      </ul>
    `,
  },

  // Comunicacao — artigos adicionais
  {
    slug: "intimacoes-eletronicas",
    title: "Intimacoes eletronicas",
    category: "comunicacao",
    excerpt: "Como configurar captura automatica de intimacoes via intima.ai.",
    body: `
      <h3>1. Configure a integracao</h3>
      <p>Acesse <strong>Integracoes</strong> e adicione uma integracao do tipo "intima.ai" com seu token de API.</p>

      <h3>2. Monitoramento automatico</h3>
      <p>Processos com numero CNJ sao monitorados automaticamente. Novas intimacoes aparecem em <strong>Comunicacao > Intimacoes</strong>.</p>

      <h3>3. Calcule prazos</h3>
      <p>A partir de cada intimacao, voce pode calcular o prazo processual diretamente.</p>
    `,
  },
  {
    slug: "diario-oficial",
    title: "Diario Oficial",
    category: "comunicacao",
    excerpt: "Como monitorar publicacoes no diario oficial.",
    body: `
      <h3>1. Configure a busca</h3>
      <p>Acesse <strong>Documentos > Diario Oficial</strong> e configure os termos de busca (nome do cliente, numero do processo, etc.).</p>

      <h3>2. Monitoramento</h3>
      <p>O sistema verifica diariamente as publicacoes e alerta quando encontra correspondencias.</p>

      <h3>3. Notificacoes</h3>
      <p>Publicacoes encontradas geram notificacoes automaticas no sistema.</p>
    `,
  },

  // IA — artigo adicional
  {
    slug: "configurar-ia",
    title: "Configurar IA (OpenAI/compativel)",
    category: "ia",
    excerpt: "Como configurar o provedor de IA para chat e resumos.",
    body: `
      <h3>1. Obtenha uma API key</h3>
      <p>Use OpenAI, Azure OpenAI, ou qualquer provedor compativel com a API da OpenAI (LM Studio, Ollama, etc.).</p>

      <h3>2. Configure as variaveis de ambiente</h3>
      <ul>
        <li><code>AI_API_KEY</code>: sua chave de API</li>
        <li><code>AI_BASE_URL</code>: URL base (padrao: https://api.openai.com/v1)</li>
        <li><code>AI_MODEL</code>: modelo (padrao: gpt-4o-mini)</li>
      </ul>

      <h3>3. Rate limiting</h3>
      <p>Cada tenant tem um limite de requisicoes de IA por hora, configuravel via <code>AI_RATE_LIMIT_PER_TENANT</code>.</p>

      <h3>Privacidade</h3>
      <p>Dados sensiveis (PII) sao mascarados antes de enviar para a IA. O mascaramento ocorre antes da construcao do prompt.</p>
    `,
  },
];

// Get articles by category.
export function getArticlesByCategory(categorySlug: string): HelpArticle[] {
  return helpArticles.filter((a) => a.category === categorySlug);
}

// Search articles.
export function searchArticles(query: string): HelpArticle[] {
  const q = query.toLowerCase();
  return helpArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q),
  );
}
