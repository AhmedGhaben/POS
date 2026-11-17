/**
 * Single source of truth for status wording used across the whole site.
 * AGT wording rules (About brief §3.5): always "Ainda não validado".
 * Never "Em preparação", "Em curso", "Pendente", "certificado", "aprovado",
 * "compatível com a AGT", seals or expected dates.
 */
export const AGT_STATUS = 'Ainda não validado';
export const LAUNCH_STATUS = 'Ainda não lançada';

/** Company commitment sentence — needs legal review (About brief §3.5, [LEGAL]). */
export const AGT_COMMITMENT =
  'Estamos a concluir as verificações técnicas e a preparar o processo de validação do software junto da AGT. ' +
  'A STORBIT só será utilizada para facturação depois de cumpridos os requisitos aplicáveis da AGT.';

export const AUDIENCE = 'mercearias, minimercados e supermercados';
