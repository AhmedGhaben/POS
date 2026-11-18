/**
 * Central map of marketing media (handoff §4). Videos and screenshots are
 * future or unreviewed assets: nothing here is presented as finished unless
 * its status says so.
 *
 * To publish a video: produce it, set `src`, `poster` and `captionsSrc`
 * (pt-AO subtitles, WebVTT), then switch `status` to 'ready'.
 */
import caixaOfflinePt from '../assets/screens/caixa-offline-pt.png';
import caixaOfflineEn from '../assets/screens/caixa-offline-en.png';
import gestaoPainelPt from '../assets/screens/gestao-painel-pt.png';
import gestaoPainelEn from '../assets/screens/gestao-painel-en.png';
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
  /** One capture per site language: the app shown in that language. */
  image: { 'pt-AO': ImageMetadata; en: ImageMetadata };
  /**
   * 'preview'  = real capture with demo data, not yet from a reviewed release
   *              build: shown in preview mode only.
   * 'approved' = captured from a reviewed build with demo data; may go public.
   */
  status: 'preview' | 'approved';
  /** How the capture was made (see scripts/app-captures/README.md). */
  source: string;
};

export const screens: Record<ScreenKey, ScreenAsset> = {
  CAIXA: {
    title: 'STORBIT Caixa',
    alt: {
      'pt-AO':
        'Ecrã da STORBIT Caixa para Windows sem internet: indicador âmbar "Sem internet · a vender · 2 vendas por enviar" no topo e uma venda em curso com três produtos.',
      en: 'STORBIT Caixa for Windows screen while offline: amber "Offline · still selling · 2 sales waiting to sync" indicator at the top and a sale in progress with three products.',
    },
    image: { 'pt-AO': caixaOfflinePt, en: caixaOfflineEn },
    status: 'preview',
    source:
      'Windows Caixa (Electron build of main @ c8f4e00), demo seed data; two sales made with the server unreachable ("Saved offline"), both synced afterwards. scripts/app-captures/',
  },
  GESTAO: {
    title: 'STORBIT Gestão',
    alt: {
      'pt-AO':
        'Painel da STORBIT Gestão com dados de demonstração da loja fictícia Mercearia Central: receita, vendas e produtos mais vendidos.',
      en: 'STORBIT Gestão dashboard with demo data from the fictional shop Mercearia Central: revenue, orders and best-selling products.',
    },
    image: { 'pt-AO': gestaoPainelPt, en: gestaoPainelEn },
    status: 'preview',
    source: 'Gestão in the browser (web build of main @ c8f4e00), same demo data after the offline sales synced. scripts/app-captures/',
  },
};
