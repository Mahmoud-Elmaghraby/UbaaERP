import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BranchDto,
  CreateBranchDto,
  CreateDocumentTemplateDto,
  CreateNumberingSequenceDto,
  CreateTaxRuleDto,
  CustomFieldDefinitionDto,
  DocumentTemplateDto,
  FeatureToggleDto,
  NumberingSequenceDto,
  TaxRuleDto,
  TenantSettingsDto,
  UpdateDocumentTemplateDto,
  UpdateFeatureToggleDto,
  UpdateNumberingSequenceDto,
  UpdateTaxRuleDto,
  UpdateTenantSettingsDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client';

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => apiGet<BranchDto[]>('/branches') });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBranchDto) => apiPost<BranchDto>('/branches', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches'] }),
  });
}

export function useCustomFieldDefinitions(entityType: string) {
  return useQuery({
    queryKey: ['custom-field-definitions', entityType],
    queryFn: () =>
      apiGet<CustomFieldDefinitionDto[]>(
        `/custom-field-definitions?entityType=${encodeURIComponent(entityType)}`,
      ),
  });
}

// --- General (tenant_settings) --------------------------------------------

export function useTenantSettings() {
  return useQuery({ queryKey: ['tenant-settings'], queryFn: () => apiGet<TenantSettingsDto>('/settings') });
}

export function useUpdateTenantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantSettingsDto) => apiPatch<TenantSettingsDto>('/settings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] }),
  });
}

// --- Numbering sequences ---------------------------------------------------

export function useNumberingSequences() {
  return useQuery({
    queryKey: ['numbering-sequences'],
    queryFn: () => apiGet<NumberingSequenceDto[]>('/numbering-sequences'),
  });
}

export function useCreateNumberingSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNumberingSequenceDto) =>
      apiPost<NumberingSequenceDto>('/numbering-sequences', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['numbering-sequences'] }),
  });
}

export function useUpdateNumberingSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNumberingSequenceDto }) =>
      apiPatch<NumberingSequenceDto>(`/numbering-sequences/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['numbering-sequences'] }),
  });
}

export function useDeleteNumberingSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/numbering-sequences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['numbering-sequences'] }),
  });
}

// --- Document templates -----------------------------------------------------

export function useDocumentTemplates() {
  return useQuery({
    queryKey: ['document-templates'],
    queryFn: () => apiGet<DocumentTemplateDto[]>('/document-templates'),
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocumentTemplateDto) =>
      apiPost<DocumentTemplateDto>('/document-templates', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-templates'] }),
  });
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentTemplateDto }) =>
      apiPatch<DocumentTemplateDto>(`/document-templates/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-templates'] }),
  });
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/document-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-templates'] }),
  });
}

// --- Tax rules ---------------------------------------------------------------

export function useTaxRules() {
  return useQuery({ queryKey: ['tax-rules'], queryFn: () => apiGet<TaxRuleDto[]>('/tax-rules') });
}

/** Active tax rules for invoice, product and party forms (GET /tax-rules/lookup — not settings-only). */
export function useTaxRuleLookup() {
  return useQuery({
    queryKey: ['tax-rules', 'lookup'],
    queryFn: () => apiGet<TaxRuleDto[]>('/tax-rules/lookup'),
    staleTime: 60_000,
  });
}

export function useCreateTaxRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaxRuleDto) => apiPost<TaxRuleDto>('/tax-rules', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rules'] }),
  });
}

export function useUpdateTaxRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaxRuleDto }) =>
      apiPatch<TaxRuleDto>(`/tax-rules/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rules'] }),
  });
}

export function useDeleteTaxRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/tax-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rules'] }),
  });
}

// --- Feature toggles (Layer 2 self-service, platform-flexibility-strategy.md) ---

export function useFeatureToggles(enabled = true) {
  return useQuery({
    queryKey: ['feature-toggles'],
    queryFn: () => apiGet<FeatureToggleDto[]>('/feature-toggles'),
    enabled,
  });
}

export function useUpdateFeatureToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ featureKey, input }: { featureKey: string; input: UpdateFeatureToggleDto }) =>
      apiPatch<FeatureToggleDto>(`/feature-toggles/${encodeURIComponent(featureKey)}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-toggles'] }),
  });
}
