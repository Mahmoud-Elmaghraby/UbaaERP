import { Global, Module } from '@nestjs/common';
import { SecretsEncryptionService } from './secrets-encryption.service';

/**
 * Global module (mirrors OutboxModule/TenancyModule/AuthInfraModule) so
 * any business module can inject SecretsEncryptionService without
 * re-wiring it. First consumer: Sales' EtaCredentialsService.
 */
@Global()
@Module({
  providers: [SecretsEncryptionService],
  exports: [SecretsEncryptionService],
})
export class SecretsEncryptionModule {}
