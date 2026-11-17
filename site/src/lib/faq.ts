import { CLAIM_VERIFIED } from '../config';
import type { Faq } from '../data/help';

/** The answer the public may see, or '' when it must not be shown. */
export const publicAnswer = (f: Faq): string =>
  !f.claim || CLAIM_VERIFIED(f.claim) ? f.a : (f.fallback ?? '');

export const faqJsonLd = (items: Faq[]) => {
  const visible = items.filter((f) => publicAnswer(f));
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: visible.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: publicAnswer(f) },
    })),
  };
};
