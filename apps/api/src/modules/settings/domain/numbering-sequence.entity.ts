export interface NumberingSequence {
  id: string;
  documentType: string;
  branchId: string | null;
  prefix: string | null;
  nextNumber: number;
  paddingLength: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNumberingSequenceInput {
  documentType: string;
  branchId?: string | null;
  prefix?: string | null;
  nextNumber?: number;
  paddingLength?: number;
}

export interface UpdateNumberingSequenceInput {
  prefix?: string | null;
  nextNumber?: number;
  paddingLength?: number;
}

/** Result of atomically claiming the next number in a sequence. */
export interface AllocatedDocumentNumber {
  sequenceId: string;
  number: number;
  /** Fully formatted: prefix + zero-padded number, e.g. "INV-00042". */
  formatted: string;
}
