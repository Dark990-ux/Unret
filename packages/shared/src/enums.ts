// Single source of truth for statuses shared by API, web and mobile.
// These mirror the Prisma enums in apps/api/prisma/schema.prisma.

export const RequestStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  OFFERS_RECEIVED: 'OFFERS_RECEIVED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const OfferStatus = {
  PENDING: 'PENDING',
  MODIFICATION_REQUESTED: 'MODIFICATION_REQUESTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const JobStatus = {
  ACCEPTED: 'ACCEPTED',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const VerificationType = {
  IDENTITY: 'IDENTITY',
  BUSINESS: 'BUSINESS',
  QUALIFICATION: 'QUALIFICATION',
  ADDITIONAL: 'ADDITIONAL',
} as const;
export type VerificationType = (typeof VerificationType)[keyof typeof VerificationType];

export const VerificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const PaymentMethod = { DIRECT: 'DIRECT', TRANSFER: 'TRANSFER', CASH: 'CASH', PLATFORM: 'PLATFORM' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const Urgency = { LOW: 'LOW', NORMAL: 'NORMAL', HIGH: 'HIGH', EMERGENCY: 'EMERGENCY' } as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export const Role = { USER: 'USER', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const NotificationType = {
  NEW_MATCHING_REQUEST: 'NEW_MATCHING_REQUEST',
  NEW_OFFER: 'NEW_OFFER',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_REJECTED: 'OFFER_REJECTED',
  OFFER_MODIFICATION_REQUESTED: 'OFFER_MODIFICATION_REQUESTED',
  OFFER_REVISED: 'OFFER_REVISED',
  NEW_MESSAGE: 'NEW_MESSAGE',
  APPOINTMENT_APPROACHING: 'APPOINTMENT_APPROACHING',
  JOB_STATUS_CHANGED: 'JOB_STATUS_CHANGED',
  JOB_CHANGE_PROPOSED: 'JOB_CHANGE_PROPOSED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_TO_CONFIRM: 'PAYMENT_TO_CONFIRM',
  REVIEW_RECEIVED: 'REVIEW_RECEIVED',
  VERIFICATION_UPDATED: 'VERIFICATION_UPDATED',
  DISPUTE_UPDATED: 'DISPUTE_UPDATED',
  /** "Notify me when X is free" fired. */
  AVAILABILITY_OPENED: 'AVAILABILITY_OPENED',
  /** A professional reached their plan's daily number of new requests. */
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  /** Subscription started, renewed, payment failed or ended. */
  SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',
  /** Support ticket replies and status changes (and admin team notices). */
  SUPPORT_UPDATED: 'SUPPORT_UPDATED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Notification types that cannot be switched off by the user (critical/transactional). */
export const ESSENTIAL_NOTIFICATIONS: NotificationType[] = [
  'OFFER_ACCEPTED',
  'JOB_CANCELLED',
  'PAYMENT_COMPLETED',
  'JOB_CHANGE_PROPOSED',
  'DISPUTE_UPDATED',
];
