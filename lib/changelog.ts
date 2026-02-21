export type ChangelogEntry = {
  version: string;
  date: string;
  improvements: string[];
  fixes: string[];
};

export const LIVESTATION_CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.4.5",
    date: "2026-02-20",
    improvements: [
      "Fluxo completo de recuperacao de senha com telas dedicadas (esqueci senha e redefinir senha).",
      "Perfil com alteracao de senha em popup dedicado e botao de acesso rapido.",
      "Novo centro de atualizacoes com historico por versao, mais recente no topo.",
      "Novo sistema de relatar bug com tipo, descricao, imagem e listagem de relatos.",
      "Acoes de relato no topo direito com icones e melhorias visuais no modal de bugs."
    ],
    fixes: [
      "Ajustes no cookie de sessao para suporte a 'Lembrar de mim'.",
      "Correcao do build na pagina de reset de senha sem dependencia client-side de search params.",
      "Refino de layout/spacing dos popups para melhorar legibilidade e consistencia visual.",
      "Estabilizacao de API e persistencia para relatos de bug com suporte a resposta de admin.",
      "Ajuste do chat embed do YouTube para manter a navegacao dentro do LiveStation durante autenticacao.",
      "Novo indicador visual de mensagens nao lidas no botao Chat LiveStation.",
      "Correcao do contador de nao lidas para limpar ao abrir o chat sem retornar em loop.",
      "Persistencia do chat em Postgres (quando DATABASE_URL estiver configurado) para manter historico apos F5 em producao.",
      "Suporte automatico a POSTGRES_URL/POSTGRES_PRISMA_URL/NEON_DATABASE_URL para persistir tempo assistido e estatisticas mesmo sem DATABASE_URL explicita."
    ]
  },  {
    version: "v0.4.4",
    date: "2026-02-19",
    improvements: [
      "Busca integrada no topo com visualizacao dos resultados dentro da tela principal.",
      "Janela suspensa com controles expandidos, pin por modos e retorno rapido para o slot.",
      "Melhoria geral do perfil com opcoes centralizadas."
    ],
    fixes: [
      "Ajustes no fluxo de adicionar videos para evitar sobreposicao no mesmo slot.",
      "Correcao de navegacao entre layout ativo e modo de busca.",
      "Refino de estabilidade no uso continuo dos slots e chat."
    ]
  },
  {
    version: "v0.4.3",
    date: "2026-02-18",
    improvements: [
      "Painel de layouts com estilo de selecao por linha.",
      "Rodape reorganizado com branding e links sociais.",
      "Aprimoramento do comportamento mobile em orientacao retrato."
    ],
    fixes: [
      "Correcao de alinhamento do header e avatar no mobile.",
      "Melhoria no controle de audio por slot.",
      "Ajustes no contador de tempo assistido."
    ]
  },
  {
    version: "v0.4.2",
    date: "2026-02-16",
    improvements: [
      "Primeira versao publica com multi-view, estatisticas e autenticacao.",
      "Integracao inicial com sitemap/robots e verificacao de e-mail."
    ],
    fixes: [
      "Correcao de problemas de sessao em ambiente de producao.",
      "Ajustes de variaveis de ambiente para auth e SMTP."
    ]
  }
];


