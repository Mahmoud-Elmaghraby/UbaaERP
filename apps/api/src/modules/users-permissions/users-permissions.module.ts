import { Module } from '@nestjs/common';
import { PERMISSION_REPOSITORY } from './application/ports/permission.repository';
import { ROLE_REPOSITORY } from './application/ports/role.repository';
import { USER_REPOSITORY } from './application/ports/user.repository';
import { USER_BRANCH_ACCESS_REPOSITORY } from './application/ports/user-branch-access.repository';
import { APPROVAL_CHAIN_REPOSITORY } from './application/ports/approval-chain.repository';
import { AUDIT_LOG_REPOSITORY } from './application/ports/audit-log.repository';
import { REFRESH_TOKEN_REPOSITORY } from './application/ports/refresh-token.repository';

import { KyselyPermissionRepository } from './infrastructure/persistence/kysely-permission.repository';
import { KyselyRoleRepository } from './infrastructure/persistence/kysely-role.repository';
import { KyselyUserRepository } from './infrastructure/persistence/kysely-user.repository';
import { KyselyUserBranchAccessRepository } from './infrastructure/persistence/kysely-user-branch-access.repository';
import { KyselyApprovalChainRepository } from './infrastructure/persistence/kysely-approval-chain.repository';
import { KyselyAuditLogRepository } from './infrastructure/persistence/kysely-audit-log.repository';
import { KyselyRefreshTokenRepository } from './infrastructure/persistence/kysely-refresh-token.repository';

import { PermissionsService } from './application/services/permissions.service';
import { RolesService } from './application/services/roles.service';
import { UsersService } from './application/services/users.service';
import { UserBranchAccessService } from './application/services/user-branch-access.service';
import { ApprovalChainsService } from './application/services/approval-chains.service';
import { AuditLogsService } from './application/services/audit-logs.service';
import { AuthService } from './application/services/auth.service';

import { AuthController } from './presentation/auth.controller';
import { PermissionsController } from './presentation/permissions.controller';
import { RolesController } from './presentation/roles.controller';
import { UsersController } from './presentation/users.controller';
import { AuditLogsController } from './presentation/audit-logs.controller';

/**
 * Users & Permissions module (CLAUDE.md §10: step 1, alongside Settings).
 * Plain CRUD + one cross-cutting concern (auth) — Clean Architecture
 * layering still applies. JwtStrategy/JwtModule/PermissionsGuard come
 * from the global AuthInfraModule (see ../../shared/auth/), not
 * re-provided here, mirroring how TenantConnectionManager comes from the
 * global TenancyModule for Settings.
 */
@Module({
  controllers: [AuthController, PermissionsController, RolesController, UsersController, AuditLogsController],
  providers: [
    { provide: PERMISSION_REPOSITORY, useClass: KyselyPermissionRepository },
    { provide: ROLE_REPOSITORY, useClass: KyselyRoleRepository },
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: USER_BRANCH_ACCESS_REPOSITORY, useClass: KyselyUserBranchAccessRepository },
    { provide: APPROVAL_CHAIN_REPOSITORY, useClass: KyselyApprovalChainRepository },
    { provide: AUDIT_LOG_REPOSITORY, useClass: KyselyAuditLogRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: KyselyRefreshTokenRepository },
    PermissionsService,
    RolesService,
    UsersService,
    UserBranchAccessService,
    ApprovalChainsService,
    AuditLogsService,
    AuthService,
  ],
})
export class UsersPermissionsModule {}
