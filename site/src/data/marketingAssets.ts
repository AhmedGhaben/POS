/**
 * Central map of marketing media (handoff §4). Videos and screenshots are
 * future or unreviewed assets: nothing here is presented as finished unless
 * its status says so.
 *
 * To publish a video: produce it, set `src`, `poster` and `captionsSrc`
 * (pt-AO subtitles, WebVTT), then switch `status` to 'ready'.
 */
import caixaSemInternet from '../assets/screens/caixa-sem-internet.png';
import gestaoPainel from '../assets/screens/gestao-painel.png';
import type { ImageMetadata } from 'astro';
import type { L } from '../i18n';

export type VideoKey =
  | 'VIDEO_PRODUCT_OVERVIEW'
  | 'VIDEO_BRAND_STORY'
  | 'VIDEO_SIMPLE_CHECKOUT'
  | 'VIDEO_HARDWARE_SETUP'
  | 'VIDEO_MULTI_STORE'
  | 'VIDEO_OFFLINE_SYNC'
  | 'VIDEO_STOCK_REPORTS';

export type VideoAsset = {
  title: L;
  length: string;
  placement: L;
  poster: string;
  src: string;
  captionsSrc: string;
  status: 'planned' | 'ready';
};

export const videos: Record<VideoKey, VideoAsset> = {
  VIDEO_PRODUCT_OVERVIEW: {
    title: { 'pt-AO': 'A STORBIT em 1 minuto', en: 'STORBIT in 1 minute' },
    length: '60–90 s',
    placement: { 'pt-AO': 'Início', en: 'Home' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_BRAND_STORY: {
    title: { 'pt-AO': 'Porque criámos a STORBIT', en: 'Why we built STORBIT' },
    length: '45–60 s',
    placement: { 'pt-AO': 'Sobre', en: 'About' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_SIMPLE_CHECKOUT: {
    title: { 'pt-AO': 'Uma venda simples', en: 'A simple sale' },
    length: '15–30 s',
    placement: { 'pt-AO': 'Como funciona', en: 'How it works' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_HARDWARE_SETUP: {
    title: { 'pt-AO': 'Impressora de talões e gaveta de dinheiro', en: 'Receipt printer and cash drawer' },
    length: '15–30 s',
    placement: { 'pt-AO': 'Como funciona · Ajuda', en: 'How it works · Help' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_MULTI_STORE: {
    title: { 'pt-AO': 'Várias lojas na Gestão', en: 'Several stores in Gestão' },
    length: '15–30 s',
    placement: { 'pt-AO': 'Como funciona', en: 'How it works' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_OFFLINE_SYNC: {
    title: { 'pt-AO': 'Sem internet e sincronização', en: 'Offline and syncing' },
    length: '15–30 s',
    placement: { 'pt-AO': 'Como funciona', en: 'How it works' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_STOCK_REPORTS: {
    title: { 'pt-AO': 'Stock e relatórios', en: 'Stock and reports' },
    length: '15–30 s',
    placement: { 'pt-AO': 'Início · Como funciona', en: 'Home · How it works' },
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
};

export const isVideoReady = (v: VideoAsset) => v.status === 'ready' && Boolean(v.src);

export type ScreenKey = 'CAIXA' | 'GESTAO';
export type ScreenAsset = {
  title: string;
  alt: L;
  image: ImageMetadata;
  /**
   * 'preview'  = real capture with demo data, from the rebrand build
   *              (docs/brand/screenshots). Not yet from a reviewed release
   *              build, so it is shown in preview mode only.
   * 'approved' = captured from a reviewed build with demo data; may go public.
   */
  status: 'preview' | 'approved';
  source: string;
};

export const screens: Record<ScreenKey, ScreenAsset> = {
  CAIXA: {
    title: 'STORBIT Caixa',
    alt: {
      'pt-AO': 'Ecrã da STORBIT Caixa a vender sem internet: indicador âmbar "Sem internet · a vender" no topo e campo para ler o código de barras.',
      en: 'STORBIT Caixa screen selling offline: amber "Sem internet · a vender" (offline, still selling) indicator at the top and the barcode field.',
    },
    image: caixaSemInternet,
    status: 'preview',
    source: 'docs/brand/screenshots/after-till-offline.png',
  },
  GESTAO: {
    title: 'STORBIT Gestão',
    alt: {
      'pt-AO': 'Painel da STORBIT Gestão com dados de demonstração da loja fictícia Mercearia Central: receita, vendas e produtos mais vendidos.',
      en: 'STORBIT Gestão dashboard with demo data from the fictional shop Mercearia Central: revenue, sales and best-selling products.',
    },
    image: gestaoPainel,
    status: 'preview',
    source: 'docs/brand/screenshots/after-dashboard.png',
  },
};
