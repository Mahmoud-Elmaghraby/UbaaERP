export type CustomFieldType = 'text' | 'number' | 'date' | 'list';

export interface CustomFieldDefinition {
  id: string;
  entityType: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  /** Only meaningful when fieldType === 'list'. */
  options: string[] | null;
  isRequired: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomFieldDefinitionInput {
  entityType: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[] | null;
  isRequired?: boolean;
  displayOrder?: number;
}

export interface UpdateCustomFieldDefinitionInput {
  label?: string;
  fieldType?: CustomFieldType;
  options?: string[] | null;
  isRequired?: boolean;
  displayOrder?: number;
}
