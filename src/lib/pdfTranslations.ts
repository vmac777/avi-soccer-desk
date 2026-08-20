import { CLIENT } from '@/config/client';

export type Lang = 'en' | 'pt';

export const t = {
  exportPdf: { en: 'Export PDF', pt: 'Exportar PDF' },
  exportTitle: { en: 'Export Player Dossier', pt: 'Exportar Dossiê do Jogador' },
  language: { en: 'Language', pt: 'Idioma' },
  english: { en: 'English', pt: 'Inglês' },
  portuguese: { en: 'Portuguese', pt: 'Português' },
  includeSections: { en: 'Include sections', pt: 'Incluir seções' },
  generate: { en: 'Generate PDF', pt: 'Gerar PDF' },
  generating: { en: 'Generating…', pt: 'Gerando…' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },

  // Sections
  sporting: { en: 'Sporting Information', pt: 'Informações Esportivas' },
  highlight: { en: 'Highlight Reel', pt: 'Vídeo de Destaques' },
  financials: { en: 'Financials', pt: 'Financeiro' },
  market: { en: 'Market Intelligence', pt: 'Inteligência de Mercado' },
  xtv: { en: 'xTV History', pt: 'Histórico de xTV' },
  gbe: { en: 'GBE (UK Work Permit)', pt: 'GBE (Permissão de Trabalho UK)' },
  transfers: { en: 'Transfer History', pt: 'Histórico de Transferências' },

  // Field labels
  position: { en: 'Position', pt: 'Posição' },
  dob: { en: 'Date of Birth', pt: 'Data de Nascimento' },
  nationality: { en: 'Nationality', pt: 'Nacionalidade' },
  height: { en: 'Height', pt: 'Altura' },
  previousClub: { en: 'Previous Club', pt: 'Clube Anterior' },
  atClubSince: { en: `At ${CLIENT.shortName} Since`, pt: `No ${CLIENT.shortName} Desde` },
  mandate: { en: 'Our Mandate', pt: 'Nosso Mandato' },
  mandateStart: { en: 'Mandate From', pt: 'Mandato Desde' },
  mandateEnd: { en: 'Mandate Until', pt: 'Mandato Até' },
  exclusivity: { en: 'Exclusivity', pt: 'Exclusividade' },
  exclusiveYes: { en: 'Exclusive', pt: 'Exclusivo' },
  exclusiveNo: { en: 'Non-exclusive', pt: 'Não exclusivo' },
  commission: { en: 'Commission', pt: 'Comissão' },
  sellOn: { en: 'Sell-on', pt: 'Participação em Revenda' },
  currentClub: { en: 'Current Club', pt: 'Clube Atual' },
  marketValue: { en: 'Market Value', pt: 'Valor de Mercado' },
  preferredFoot: { en: 'Preferred Foot', pt: 'Pé Preferido' },
  playingStyle: { en: 'Playing Style', pt: 'Estilo de Jogo' },
  secondPosition: { en: 'Second Position', pt: 'Segunda Posição' },
  trRating: { en: 'TR Rating', pt: 'Avaliação TR' },
  trPotential: { en: 'TR Potential', pt: 'Potencial TR' },
  recentMinutes: { en: 'Recent Minutes', pt: 'Minutos Recentes' },

  contractEnd: { en: 'Contract End', pt: 'Fim de Contrato' },
  contractRights: { en: 'Contract & Rights', pt: 'Contrato e Direitos' },

  // A player out on loan has two live deals. The parent contract says when he
  // can be sold or goes free; the loan end says when he goes back. A club
  // reading the document needs both, and needs to see which is which.
  parentClub: { en: 'Parent Club', pt: 'Clube Detentor' },
  loanClub: { en: 'On Loan At', pt: 'Emprestado a' },
  loanEnd: { en: 'Loan Ends', pt: 'Fim do Empréstimo' },
  freeAgent: { en: 'Free Agent', pt: 'Sem Clube' },

  // The club-owner cost block — salary, image rights, release clauses, economic
  // rights, luvas — is deliberately absent. That is a selling club's internal
  // position, not an agency's, and this document goes to the buying side.

  valuation: { en: 'Valuation', pt: 'Avaliação' },
  availability: { en: 'Availability & Representation', pt: 'Disponibilidade e Representação' },
  xtvLabel: { en: 'xTV', pt: 'xTV' },
  xtv6m: { en: 'xTV 6m Change', pt: 'Variação xTV 6m' },
  xtv12m: { en: 'xTV 12m Change', pt: 'Variação xTV 12m' },
  baseValue: { en: 'Base Value', pt: 'Valor Base' },
  availableForSale: { en: 'Available for Sale', pt: 'Disponível para Venda' },
  askingPrice: { en: 'Asking Price', pt: 'Preço Pedido' },
  agency: { en: 'Agency', pt: 'Agência' },
  notListed: { en: 'Not Listed', pt: 'Não Listado' },

  date: { en: 'Date', pt: 'Data' },
  fromTo: { en: 'From → To', pt: 'De → Para' },
  fee: { en: 'Fee', pt: 'Valor' },
  type: { en: 'Type', pt: 'Tipo' },

  gbeScore: { en: 'pts', pt: 'pts' },
  yrs: { en: 'yrs', pt: 'anos' },
  since: { en: 'Since', pt: 'Desde' },
  euPassport: { en: 'EU Passport', pt: 'Passaporte UE' },
  watchVideo: { en: 'Watch full video', pt: 'Assistir vídeo completo' },
  clickPictureToOpen: { en: 'Click picture to open video', pt: 'Clique na imagem para abrir o vídeo' },
  noData: { en: 'No data available.', pt: 'Sem dados disponíveis.' },
  generatedOn: { en: 'Generated on', pt: 'Gerado em' },
  confidential: { en: 'CONFIDENTIAL', pt: 'CONFIDENCIAL' },
  page: { en: 'Page', pt: 'Página' },
  of: { en: 'of', pt: 'de' },
  directorsNotes: { en: "Director's Notes", pt: 'Observações' },
  directorsNotesPlaceholder: { en: 'Add notes from the Director (will appear on the PDF)…', pt: 'Adicionar observações do Diretor (aparecerão no PDF)…' },
};


export const tr = (key: keyof typeof t, lang: Lang): string => t[key][lang];

export function formatPdfDate(dateStr: string | undefined, lang: Lang): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
