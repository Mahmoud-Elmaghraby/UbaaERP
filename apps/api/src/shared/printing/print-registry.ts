import { Injectable } from '@nestjs/common';
import type { PrintProvider } from './print-provider';

@Injectable()
export class PrintRegistry {
  private readonly providers = new Map<string, PrintProvider>();

  register(...providers: PrintProvider[]): void {
    for (const provider of providers) {
      if (this.providers.has(provider.documentType)) {
        throw new Error(`Print provider for "${provider.documentType}" registered twice.`);
      }
      this.providers.set(provider.documentType, provider);
    }
  }

  get(documentType: string): PrintProvider | undefined {
    return this.providers.get(documentType);
  }

  list(): PrintProvider[] {
    return [...this.providers.values()];
  }
}
