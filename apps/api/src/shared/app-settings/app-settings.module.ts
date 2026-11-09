import { Global, Module } from '@nestjs/common';
import { AppSettingsRepository } from './app-settings.repository';

/** Global, like PlansModule: any module may read a setting through AppSettingsRepository.get(). */
@Global()
@Module({
  providers: [AppSettingsRepository],
  exports: [AppSettingsRepository],
})
export class AppSettingsModule {}
