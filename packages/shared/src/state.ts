import { JobStatus, RequestStatus } from './enums';

/** Allowed job status transitions. Completion and disputes have extra rules enforced server-side. */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  ACCEPTED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Request statuses in which professionals may still submit offers. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ['PUBLISHED', 'OFFERS_RECEIVED'];
