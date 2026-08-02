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
