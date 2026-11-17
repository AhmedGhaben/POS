/**
 * FAQ and glossary (WEBSITE_SPEC §3 /ajuda, handoff §3 /ajuda).
 * Every answer must stay inside the claims register (WEBSITE_SPEC §4).
 * Answers that depend on an untested claim carry `claim` and are only
 * published once that claim is verified (see config CLAIMS_VERIFIED); until
 * then `fallback` is used publicly and the preview shows both.
 */
import type { ClaimId } from '../config';
import { AGT_STATUS, AUDIENCE } from './status';

export type FaqCategory = 'Começar' | 'Caixa' | 'Gestão' | 'Equipamento' | 'Estado e AGT';

export type Faq = {
  id: string;
  category: FaqCategory;
  q: string;
  a: string;
  /** Show on the home page FAQ. */
  home?: boolean;
  claim?: ClaimId;
  /** Public answer while `claim` is not verified. */
  fallback?: string;
};

export const faqs: Faq[] = [
  {
    id: 'sem-internet',
    category: 'Caixa',
    home: true,
    q: 'Funciona sem internet?',
    a:
      'Sim. A STORBIT Caixa continua a vender sem internet e envia as vendas guardadas quando a ligação volta. ' +
      'Enquanto houver vendas por enviar, a caixa mostra quantas são, por exemplo "Sem internet · a vender · 3 vendas por enviar".',
  },
  {
    id: 'energia',
    category: 'Caixa',
    q: 'E se faltar a energia?',
    a: 'Se faltar a energia, as vendas já concluídas ficam guardadas no computador e são sincronizadas quando o equipamento volta a ligar.',
    claim: 'power-cut',
    fallback:
      'Uma falha de energia é diferente de uma falha de internet. Ainda estamos a testar o comportamento da caixa em cortes de energia e só publicaremos uma resposta depois desse teste. Se esta é uma preocupação na sua loja, fale connosco.',
  },
  {
    id: 'instalar',
    category: 'Começar',
    home: true,
    q: 'Preciso de instalar alguma coisa?',
    a: 'Sim, a STORBIT Caixa no computador Windows da loja. A Gestão abre no navegador.',
  },
  {
    id: 'produtos',
    category: 'Começar',
    home: true,
    q: 'Posso trazer os produtos do meu sistema actual?',
    a: 'Sim. Pode importar os produtos a partir de um ficheiro Excel (CSV ou XLSX). Antes de importar, vê uma pré-visualização que assinala as linhas com erros.',
  },
  {
    id: 'preco',
    category: 'Começar',
    home: true,
    q: 'Quanto custa?',
    a: 'Os preços ainda não estão publicados. Peça uma demonstração e falamos sobre a sua loja.',
  },
  {
    id: 'agt',
    category: 'Estado e AGT',
    home: true,
    q: 'A STORBIT já está validada pela AGT?',
    a: `Ainda não. Validação AGT: ${AGT_STATUS.toLowerCase()}. Nesta página e na página Sobre mostramos sempre o estado actual.`,
  },
  {
    id: 'lancamento',
    category: 'Estado e AGT',
    q: 'Já posso começar a usar a STORBIT na minha loja?',
    a: 'Ainda não. A STORBIT ainda não foi lançada comercialmente. Pode pedir uma demonstração para conhecer a Caixa e a Gestão antes de decidir.',
  },
  {
    id: 'lojas',
    category: 'Gestão',
    q: 'Posso acompanhar várias lojas?',
    a: 'Sim. Na Gestão vê as vendas, os produtos e o stock de cada loja e pode registar transferências de stock entre lojas. Os dados de uma caixa aparecem na Gestão depois de sincronizados.',
  },
  {
    id: 'estado-lojas',
    category: 'Gestão',
    q: 'Consigo ver se uma loja está sem internet?',
    a: 'Sim. Na Gestão, o painel "Lojas agora" mostra cada caixa como online, sem internet ou desligada, e quantas vendas ainda estão por enviar.',
    claim: 'store-status',
    fallback: '',
  },
  {
    id: 'impressoras',
    category: 'Equipamento',
    q: 'Que impressoras e gavetas de dinheiro funcionam?',
    a: 'A caixa imprime talões em impressoras de 80 mm e 58 mm instaladas no Windows e tem um talão de calibração para acertar margens e largura. A lista de modelos testados está a ser preparada: antes de comprar equipamento, fale connosco.',
  },
  {
    id: 'para-quem',
    category: 'Começar',
    q: 'Para que lojas é a STORBIT?',
    a: `Para começar, para ${AUDIENCE} em Angola.`,
  },
  {
    id: 'computador',
    category: 'Caixa',
    q: 'Em que computador funciona a caixa?',
    a: 'A STORBIT Caixa é instalada num computador com Windows. A Gestão funciona em qualquer navegador actual, no computador ou no telemóvel.',
  },
];

export type GlossaryEntry = { term: string; def: string };

export const glossary: GlossaryEntry[] = [
  { term: 'Caixa', def: 'A aplicação STORBIT instalada no computador Windows da loja, onde se registam as vendas.' },
  { term: 'Operador de caixa', def: 'A pessoa que regista as vendas na caixa.' },
  { term: 'Gestão', def: 'A plataforma STORBIT no navegador, para acompanhar vendas, produtos, stock e lojas.' },
  { term: 'Stock', def: 'A quantidade de cada produto disponível numa loja.' },
  { term: 'Sincronização', def: 'O envio das vendas guardadas na caixa para a Gestão quando há ligação à internet.' },
  { term: 'Vendas por enviar', def: 'Vendas concluídas e guardadas na caixa que ainda não chegaram à Gestão.' },
  { term: 'Impressora de talões', def: 'A impressora térmica (normalmente de 80 mm ou 58 mm) que imprime o talão para o cliente.' },
  { term: 'Gaveta de dinheiro', def: 'A gaveta onde fica o dinheiro da caixa. Normalmente liga-se à impressora de talões, que a abre no fim de uma venda em dinheiro.' },
  { term: 'Turno', def: 'O período em que um operador trabalha numa caixa, desde a contagem inicial do dinheiro até ao fecho.' },
  { term: 'Online', def: 'A caixa está ligada à internet e as vendas estão enviadas.' },
  { term: 'Sem internet · a vender', def: 'A caixa perdeu a ligação mas continua a registar vendas e guarda-as para enviar.' },
  { term: 'A sincronizar', def: 'A ligação voltou e a caixa está a enviar as vendas guardadas.' },
];
