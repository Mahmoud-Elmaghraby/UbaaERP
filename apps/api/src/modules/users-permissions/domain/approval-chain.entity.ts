/**
 * Simple linear approval chain (master doc §16.2, §15.1): one manager
 * per user, nothing more, for the MVP.
 */
export interface ApprovalChain {
  userId: string;
  managerId: string | null;
}
