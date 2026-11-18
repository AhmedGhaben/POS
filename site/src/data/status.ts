/**
 * Single source of truth for status wording used across the whole site.
 * AGT wording rules (About brief §3.5): always "Ainda não validado" /
 * "Not yet validated". Never "Em preparação", "Em curso", "Pendente",
 * "certificado", "aprovado", "compatível com a AGT" (nor the English
 * equivalents: "in progress", "pending", "certified", "approved",
 * "AGT-compliant"), seals or expected dates.
 */
import type { L } from '../i18n';

export const AGT_STATUS: L = { 'pt-AO': 'Ainda não validado', en: 'Not yet validated' };
export const LAUNCH_STATUS: L = { 'pt-AO': 'Ainda não lançada', en: 'Not yet launched' };

/** Company commitment sentence — needs legal review (About brief §3.5, [LEGAL]). */
export const AGT_COMMITMENT: L = {
  'pt-AO':
    'Estamos a concluir as verificações técnicas e a preparar o processo de validação do software junto da AGT. ' +
    'A STORBIT só será utilizada para facturação depois de cumpridos os requisitos aplicáveis da AGT.',
  en:
    'We are completing technical checks and preparing the software validation process with the AGT. ' +
    'STORBIT will only be used for invoicing once the applicable AGT requirements have been met.',
};

export const AUDIENCE: L = {
  'pt-AO': 'mercearias, minimercados e supermercados',
  en: 'grocery shops, minimarkets and supermarkets',
};
