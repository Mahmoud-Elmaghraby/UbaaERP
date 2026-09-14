import { z } from 'zod';
import i18next from 'i18next';

/**
 * A single global Arabic error map for every Zod validation issue in the
 * frontend (CLAUDE.md §9.1 — i18n-ready from the start; mirrors the
 * backend's own error-i18n foundation in
 * apps/api/src/shared/errors/error-messages.ar.ts / domain-errors.ts).
 *
 * Registered once via `z.setErrorMap()` (see `installArZodErrorMap` below),
 * so every existing and future react-hook-form + zodResolver schema across
 * the whole app renders a friendly Arabic message automatically — zero
 * changes needed to any individual form or contract schema. An issue that
 * already carries an explicit message (e.g. `z.string().min(1, 'custom')`,
 * or a `.refine()`/`.superRefine()` call that supplies its own message)
 * always wins over this map — Zod only falls back to the global error map
 * when the issue has no explicit message of its own, so this is additive,
 * not a replacement for anywhere a form already sets a deliberate message.
 *
 * Deliberately uses the raw `i18next` singleton (not the app's own
 * `../i18n` wrapper) to avoid a circular import — `../i18n/index.ts` is
 * what calls `installArZodErrorMap()`, and both modules end up sharing the
 * exact same i18next instance regardless of which import path is used,
 * since i18next itself is a module-level singleton.
 */
export const arZodErrorMap: z.ZodErrorMap = (issue) => {
  const t = i18next.t.bind(i18next);

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      // A missing/undefined required field reads as "required", not as a
      // more technical "wrong type" message — this is by far the most
      // common case (an untouched, still-empty required field).
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: t('validation.required') };
      }
      return { message: t('validation.invalidType') };

    case z.ZodIssueCode.invalid_string:
      switch (issue.validation) {
        case 'email':
          return { message: t('validation.invalidEmail') };
        case 'url':
          return { message: t('validation.invalidUrl') };
        case 'uuid':
          // Almost always an unselected <Select> bound to a
          // z.string().uuid() field, not free text — "choose a valid
          // value" reads correctly for that case.
          return { message: t('validation.invalidUuid') };
        default:
          return { message: t('validation.invalidString') };
      }

    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        // minimum === 1 on a string is really "required" in practice
        // (every empty-string-not-allowed field in this codebase), not a
        // meaningful length constraint worth stating as a number.
        return issue.minimum === 1
          ? { message: t('validation.required') }
          : { message: t('validation.tooShort', { minLength: String(issue.minimum) }) };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return { message: t('validation.tooFewItems', { minItems: String(issue.minimum) }) };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return { message: t('validation.numberTooSmall', { min: String(issue.minimum) }) };
      }
      return { message: t('validation.default') };

    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') {
        return { message: t('validation.tooLong', { maxLength: String(issue.maximum) }) };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return { message: t('validation.tooManyItems', { maxItems: String(issue.maximum) }) };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return { message: t('validation.numberTooBig', { max: String(issue.maximum) }) };
      }
      return { message: t('validation.default') };

    case z.ZodIssueCode.invalid_enum_value:
      return { message: t('validation.invalidEnum') };

    case z.ZodIssueCode.invalid_date:
      return { message: t('validation.invalidDate') };

    case z.ZodIssueCode.not_multiple_of:
      return { message: t('validation.notMultipleOf', { multipleOf: String(issue.multipleOf) }) };

    case z.ZodIssueCode.custom:
      // A .refine()/.superRefine() call with no explicit message of its
      // own — there is no generic Arabic text that could describe an
      // arbitrary custom rule, so this falls back to the same catch-all
      // as anything unhandled below rather than ever surfacing Zod's
      // English default ("Invalid input").
      return { message: t('validation.default') };

    default:
      return { message: t('validation.default') };
  }
};

/** Call once, at app startup, before any form can mount. */
export function installArZodErrorMap(): void {
  z.setErrorMap(arZodErrorMap);
}
