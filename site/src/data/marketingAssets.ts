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

export type VideoKey =
  | 'VIDEO_PRODUCT_OVERVIEW'
  | 'VIDEO_BRAND_STORY'
  | 'VIDEO_SIMPLE_CHECKOUT'
  | 'VIDEO_HARDWARE_SETUP'
  | 'VIDEO_MULTI_STORE'
  | 'VIDEO_OFFLINE_SYNC'
  | 'VIDEO_STOCK_REPORTS';

export type VideoAsset = {
  title: string;
  length: string;
  placement: string;
  poster: string;
  src: string;
  captionsSrc: string;
  status: 'planned' | 'ready';
};

export const videos: Record<VideoKey, VideoAsset> = {
  VIDEO_PRODUCT_OVERVIEW: {
    title: 'A STORBIT em 1 minuto',
    length: '60–90 s',
    placement: 'Início',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_BRAND_STORY: {
    title: 'Porque criámos a STORBIT',
    length: '45–60 s',
    placement: 'Sobre',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_SIMPLE_CHECKOUT: {
    title: 'Uma venda simples',
    length: '15–30 s',
    placement: 'Como funciona',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_HARDWARE_SETUP: {
    title: 'Impressora de talões e gaveta de dinheiro',
    length: '15–30 s',
    placement: 'Como funciona · Ajuda',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_MULTI_STORE: {
    title: 'Várias lojas na Gestão',
    length: '15–30 s',
    placement: 'Como funciona',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_OFFLINE_SYNC: {
    title: 'Sem internet e sincronização',
    length: '15–30 s',
    placement: 'Como funciona',
    poster: '',
    src: '',
    captionsSrc: '',
    status: 'planned',
  },
  VIDEO_STOCK_REPORTS: {
    title: 'Stock e relatórios',
    length: '15–30 s',
    placement: 'Início · Como funciona',
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
  alt: string;
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
    alt: 'Ecrã da STORBIT Caixa a vender sem internet: indicador âmbar "Sem internet · a vender" no topo e campo para ler o código de barras.',
    image: caixaSemInternet,
    status: 'preview',
    source: 'docs/brand/screenshots/after-till-offline.png',
  },
  GESTAO: {
    title: 'STORBIT Gestão',
    alt: 'Painel da STORBIT Gestão com dados de demonstração da loja fictícia Mercearia Central: receita, vendas e produtos mais vendidos.',
    image: gestaoPainel,
    status: 'preview',
    source: 'docs/brand/screenshots/after-dashboard.png',
  },
};
