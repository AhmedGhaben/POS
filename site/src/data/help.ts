/**
 * FAQ and glossary (WEBSITE_SPEC §3 /ajuda, handoff §3 /ajuda), in pt-AO and
 * English. Every answer must stay inside the claims register (WEBSITE_SPEC §4).
 * Answers that depend on an untested claim carry `claim` and are only
 * published once that claim is verified (see config CLAIMS_VERIFIED); until
 * then `fallback` is used publicly and the preview shows both.
 */
import type { ClaimId } from '../config';
import type { L, Lang } from '../i18n';
import { AGT_STATUS, AUDIENCE } from './status';

export type FaqCategory = 'start' | 'caixa' | 'gestao' | 'hardware' | 'status';

export const FAQ_CATEGORIES: { id: FaqCategory; label: L }[] = [
  { id: 'start', label: { 'pt-AO': 'Começar', en: 'Getting started' } },
  { id: 'caixa', label: { 'pt-AO': 'Caixa', en: 'Caixa (till)' } },
  { id: 'gestao', label: { 'pt-AO': 'Gestão', en: 'Gestão (back office)' } },
  { id: 'hardware', label: { 'pt-AO': 'Equipamento', en: 'Hardware' } },
  { id: 'status', label: { 'pt-AO': 'Estado e AGT', en: 'Status and AGT' } },
];

type FaqSource = {
  id: string;
  category: FaqCategory;
  home?: boolean;
  claim?: ClaimId;
  q: L;
  a: L;
  fallback?: L;
};

export type Faq = {
  id: string;
  category: FaqCategory;
  /** Show on the home page FAQ. */
  home?: boolean;
  claim?: ClaimId;
  q: string;
  a: string;
  /** Public answer while `claim` is not verified ('' = hide the question). */
  fallback?: string;
};

const source: FaqSource[] = [
  {
    id: 'sem-internet',
    category: 'caixa',
    home: true,
    q: { 'pt-AO': 'Funciona sem internet?', en: 'Does it work without internet?' },
    a: {
      'pt-AO':
        'Sim. A STORBIT Caixa continua a vender sem internet e envia as vendas guardadas quando a ligação volta. ' +
        'Enquanto houver vendas por enviar, a caixa mostra quantas são, por exemplo "Sem internet · a vender · 3 vendas por enviar".',
      en:
        'Yes. STORBIT Caixa keeps selling without internet and sends the saved sales when the connection comes back. ' +
        'While there are sales waiting to be sent, the till shows how many, for example "Offline · still selling · 3 sales waiting to sync".',
    },
  },
  {
    id: 'energia',
    category: 'caixa',
    claim: 'power-cut',
    q: { 'pt-AO': 'E se faltar a energia?', en: 'What if the power goes out?' },
    a: {
      'pt-AO': 'Se faltar a energia, as vendas já concluídas ficam guardadas no computador e são sincronizadas quando o equipamento volta a ligar.',
      en: 'If the power goes out, sales already completed stay saved on the computer and are synced when the equipment is switched back on.',
    },
    fallback: {
      'pt-AO':
        'Uma falha de energia é diferente de uma falha de internet. Ainda estamos a testar o comportamento da caixa em cortes de energia e só publicaremos uma resposta depois desse teste. Se esta é uma preocupação na sua loja, fale connosco.',
      en:
        'A power cut is different from an internet outage. We are still testing how the till behaves during power cuts and will only publish an answer after that test. If this is a concern in your shop, talk to us.',
    },
  },
  {
    id: 'instalar',
    category: 'start',
    home: true,
    q: { 'pt-AO': 'Preciso de instalar alguma coisa?', en: 'Do I need to install anything?' },
    a: {
      'pt-AO': 'Sim, a STORBIT Caixa no computador Windows da loja. A Gestão abre no navegador.',
      en: "Yes, STORBIT Caixa on the shop's Windows computer. Gestão opens in the browser.",
    },
  },
  {
    id: 'produtos',
    category: 'start',
    home: true,
    q: { 'pt-AO': 'Posso trazer os produtos do meu sistema actual?', en: 'Can I bring my products from my current system?' },
    a: {
      'pt-AO': 'Sim. Pode importar os produtos a partir de um ficheiro Excel (CSV ou XLSX). Antes de importar, vê uma pré-visualização que assinala as linhas com erros.',
      en: 'Yes. You can import products from an Excel file (CSV or XLSX). Before importing, you see a check that flags any rows with errors.',
    },
  },
  {
    id: 'preco',
    category: 'start',
    home: true,
    q: { 'pt-AO': 'Quanto custa?', en: 'How much does it cost?' },
    a: {
      'pt-AO': 'Os preços ainda não estão publicados. Peça uma demonstração e falamos sobre a sua loja.',
      en: "Prices haven't been published yet. Request a demo and we'll talk about your shop.",
    },
  },
  {
    id: 'agt',
    category: 'status',
    home: true,
    q: { 'pt-AO': 'A STORBIT já está validada pela AGT?', en: 'Has STORBIT been validated by the AGT?' },
    a: {
      'pt-AO': `Ainda não. Validação AGT: ${AGT_STATUS['pt-AO'].toLowerCase()}. Nesta página e na página Sobre mostramos sempre o estado actual.`,
      en: `Not yet. AGT validation: ${AGT_STATUS.en.toLowerCase()}. This page and the About page always show the current status.`,
    },
  },
  {
    id: 'lancamento',
    category: 'status',
    q: { 'pt-AO': 'Já posso começar a usar a STORBIT na minha loja?', en: 'Can I start using STORBIT in my shop now?' },
    a: {
      'pt-AO': 'Ainda não. A STORBIT ainda não foi lançada comercialmente. Pode pedir uma demonstração para conhecer a Caixa e a Gestão antes de decidir.',
      en: "Not yet. STORBIT hasn't launched commercially. You can request a demo to see the Caixa and Gestão before you decide.",
    },
  },
  {
    id: 'lojas',
    category: 'gestao',
    q: { 'pt-AO': 'Posso acompanhar várias lojas?', en: 'Can I follow several shops?' },
    a: {
      'pt-AO': 'Sim. Na Gestão vê as vendas, os produtos e o stock de cada loja e pode registar transferências de stock entre lojas. Os dados de uma caixa aparecem na Gestão depois de sincronizados.',
      en: "Yes. In Gestão you see each shop's sales, products and stock, and you can record stock transfers between shops. A till's data appears in Gestão once it has synced.",
    },
  },
  {
    id: 'estado-lojas',
    category: 'gestao',
    claim: 'store-status',
    q: { 'pt-AO': 'Consigo ver se uma loja está sem internet?', en: 'Can I see when a shop is offline?' },
    a: {
      'pt-AO': 'Sim. Na Gestão, o painel "Lojas agora" mostra cada caixa como online, sem internet ou desligada, e quantas vendas ainda estão por enviar.',
      en: 'Yes. In Gestão, the "Stores now" panel shows each till as online, offline or switched off, and how many sales are still waiting to be sent.',
    },
    fallback: { 'pt-AO': '', en: '' },
  },
  {
    id: 'impressoras',
    category: 'hardware',
    q: { 'pt-AO': 'Que impressoras e gavetas de dinheiro funcionam?', en: 'Which printers and cash drawers work?' },
    a: {
      'pt-AO': 'A caixa imprime talões em impressoras de 80 mm e 58 mm instaladas no Windows e tem um talão de calibração para acertar margens e largura. A lista de modelos testados está a ser preparada: antes de comprar equipamento, fale connosco.',
      en: 'The till prints receipts on 80 mm and 58 mm printers installed in Windows, and has a calibration receipt to adjust margins and width. The list of tested models is being prepared: talk to us before buying equipment.',
    },
  },
  {
    id: 'para-quem',
    category: 'start',
    q: { 'pt-AO': 'Para que lojas é a STORBIT?', en: 'What kind of shops is STORBIT for?' },
    a: {
      'pt-AO': `Para começar, para ${AUDIENCE['pt-AO']} em Angola.`,
      en: `To begin with, ${AUDIENCE.en} in Angola.`,
    },
  },
  {
    id: 'computador',
    category: 'caixa',
    q: { 'pt-AO': 'Em que computador funciona a caixa?', en: 'What computer does the till run on?' },
    a: {
      'pt-AO': 'A STORBIT Caixa é instalada num computador com Windows. A Gestão funciona em qualquer navegador actual, no computador ou no telemóvel.',
      en: 'STORBIT Caixa is installed on a Windows computer. Gestão works in any current browser, on a computer or a mobile phone.',
    },
  },
];

export const getFaqs = (lang: Lang): Faq[] =>
  source.map((f) => ({
    id: f.id,
    category: f.category,
    home: f.home,
    claim: f.claim,
    q: f.q[lang],
    a: f.a[lang],
    fallback: f.fallback?.[lang],
  }));

export type GlossaryEntry = { term: string; def: string };

const glossarySource: { term: L; def: L }[] = [
  { term: { 'pt-AO': 'Caixa', en: 'Caixa (till)' }, def: { 'pt-AO': 'A aplicação STORBIT instalada no computador Windows da loja, onde se registam as vendas.', en: "The STORBIT application installed on the shop's Windows computer, where sales are recorded." } },
  { term: { 'pt-AO': 'Operador de caixa', en: 'Cashier' }, def: { 'pt-AO': 'A pessoa que regista as vendas na caixa.', en: 'The person who records sales on the till.' } },
  { term: { 'pt-AO': 'Gestão', en: 'Gestão (back office)' }, def: { 'pt-AO': 'A plataforma STORBIT no navegador, para acompanhar vendas, produtos, stock e lojas.', en: 'The STORBIT platform in the browser, for following sales, products, stock and shops.' } },
  { term: { 'pt-AO': 'Stock', en: 'Stock' }, def: { 'pt-AO': 'A quantidade de cada produto disponível numa loja.', en: 'How much of each product a shop has available.' } },
  { term: { 'pt-AO': 'Sincronização', en: 'Sync' }, def: { 'pt-AO': 'O envio das vendas guardadas na caixa para a Gestão quando há ligação à internet.', en: 'Sending the sales saved on the till to Gestão when there is an internet connection.' } },
  { term: { 'pt-AO': 'Vendas por enviar', en: 'Sales waiting to sync' }, def: { 'pt-AO': 'Vendas concluídas e guardadas na caixa que ainda não chegaram à Gestão.', en: "Completed sales saved on the till that haven't reached Gestão yet." } },
  { term: { 'pt-AO': 'Impressora de talões', en: 'Receipt printer' }, def: { 'pt-AO': 'A impressora térmica (normalmente de 80 mm ou 58 mm) que imprime o talão para o cliente.', en: "The thermal printer (usually 80 mm or 58 mm) that prints the customer's receipt." } },
  { term: { 'pt-AO': 'Gaveta de dinheiro', en: 'Cash drawer' }, def: { 'pt-AO': 'A gaveta onde fica o dinheiro da caixa. Normalmente liga-se à impressora de talões, que a abre no fim de uma venda em dinheiro.', en: 'The drawer that holds the till cash. It usually connects to the receipt printer, which opens it at the end of a cash sale.' } },
  { term: { 'pt-AO': 'Turno', en: 'Shift' }, def: { 'pt-AO': 'O período em que um operador trabalha numa caixa, desde a contagem inicial do dinheiro até ao fecho.', en: 'The period a cashier works on a till, from the opening cash count to the close.' } },
  { term: { 'pt-AO': 'Online', en: 'Online' }, def: { 'pt-AO': 'A caixa está ligada à internet e as vendas estão enviadas.', en: 'The till is connected to the internet and sales have been sent.' } },
  { term: { 'pt-AO': 'Sem internet · a vender', en: 'Offline · still selling' }, def: { 'pt-AO': 'A caixa perdeu a ligação mas continua a registar vendas e guarda-as para enviar.', en: 'The till lost its connection but keeps recording sales and saves them to send.' } },
  { term: { 'pt-AO': 'A sincronizar', en: 'Syncing (till status)' }, def: { 'pt-AO': 'A ligação voltou e a caixa está a enviar as vendas guardadas.', en: 'The connection is back and the till is sending the saved sales.' } },
];

export const getGlossary = (lang: Lang): GlossaryEntry[] =>
  glossarySource.map((g) => ({ term: g.term[lang], def: g.def[lang] }));
