/** Rules shared by the Jobs / Requests tabs and their badges in the bottom menu. */

type As = 'customer' | 'professional';

/** A job needs something from me: pay / confirm a payment after the job ended, confirm completion, approve a change, or (customer) leave a review. */
export const jobNeedsMe = (j: any, as: As) => !!j.paymentActionForMe || !!j.awaitingMyConfirmation || j.pendingChanges > 0 || (j.status === 'COMPLETED' && as === 'customer' && j.reviewed === false);

/** A customer's request has offers waiting to be chosen. */
export const requestHasOffersToChoose = (r: any) => (r.pendingOffers ?? r.offerCount) > 0 && ['PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status);
