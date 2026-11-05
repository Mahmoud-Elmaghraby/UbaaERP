import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, toast } from '@erp-platform/ui';
import { MessageCircle } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { toWesternDigits } from '../../../lib/search-normalize';
import { createShareLink } from '../api/sales-invoices/installments';

/**
 * A phone as wa.me wants it: international digits, no "+" or spaces.
 * Egypt is the default country: 01xxxxxxxxx → 201xxxxxxxxx, 1xxxxxxxxx → 201xxxxxxxxx.
 * "+…" / "00…" numbers keep their own country code. Null when it can't be a phone.
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined, defaultCountryCode = '20'): string | null {
  if (!raw) return null;
  const text = toWesternDigits(raw).trim();
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (text.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith(defaultCountryCode) && digits.length >= 11) {
    // 20 1xxxxxxxxx written without "+"
  } else if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  } else {
    digits = defaultCountryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/**
 * "إرسال واتساب": asks the API for a public view link (signed, 30 days),
 * then opens wa.me with a ready message. No paid API — WhatsApp (app or web)
 * opens on the user's device with the text filled in; they press send.
 * Without a usable phone, WhatsApp opens to pick the contact.
 */
export function WhatsAppShareButton({
  kind,
  documentId,
  phone,
  buildMessage,
  disabled,
}: {
  kind: 'sales-invoices' | 'payments-received';
  documentId: string;
  phone: string | null | undefined;
  /** The message, given the public link. */
  buildMessage: (url: string) => string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function share() {
    // Opened synchronously (inside the click) so popup blockers allow it; filled in after the link is made.
    const win = window.open('', '_blank');
    setBusy(true);
    try {
      const link = await createShareLink(kind, documentId);
      const number = normalizeWhatsAppPhone(phone);
      const url = `https://wa.me/${number ?? ''}?text=${encodeURIComponent(buildMessage(link.url))}`;
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.location.href = url;
      }
      if (!number) toast.info(t('sales.whatsapp.noPhone'));
    } catch (err) {
      win?.close();
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void share()} disabled={disabled || busy}>
      <MessageCircle />
      {t('sales.whatsapp.send')}
    </Button>
  );
}
