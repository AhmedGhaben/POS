/** The customer every sale without a chosen customer goes to (AGT: NIF 999999999). */
export const FINAL_CONSUMER_NAME = "Consumidor Final";
export const FINAL_CONSUMER_TAX_ID = "999999999";

export function finalConsumerData(businessId: string) {
  return { businessId, name: FINAL_CONSUMER_NAME, taxId: FINAL_CONSUMER_TAX_ID, isFinalConsumer: true };
}
