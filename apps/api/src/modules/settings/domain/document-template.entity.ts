export interface DocumentTemplate {
  id: string;
  documentType: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentTemplateInput {
  documentType: string;
  name: string;
  content?: string;
  isDefault?: boolean;
}

export interface UpdateDocumentTemplateInput {
  name?: string;
  content?: string;
  isDefault?: boolean;
}
