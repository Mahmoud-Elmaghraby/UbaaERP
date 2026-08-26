import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  branchSchema,
  createBranchSchema,
  updateBranchSchema,
  type BranchDto,
  type CreateBranchDto,
  type UpdateBranchDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { BranchesService } from '../application/services/branches.service';

// Permission gap: see the note at the top of settings.controller.ts —
// applies to every controller in this module.
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly service: BranchesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@TenantSchema() schema: string): Promise<BranchDto[]> {
    const db = this.connections.getClient(schema);
    const branches = await this.service.list(db);
    return branches.map((b) => branchSchema.parse(b));
  }

  @Get(':id')
  async getById(@TenantSchema() schema: string, @Param('id') id: string): Promise<BranchDto> {
    const db = this.connections.getClient(schema);
    const branch = await this.service.getById(db, id);
    return branchSchema.parse(branch);
  }

  @Post()
  async create(
    @TenantSchema() schema: string,
    // The Zod pipe is bound directly to @Body(), not via a method-level
    // @UsePipes() — a method-level pipe applies to EVERY parameter of the
    // handler, including @TenantSchema()'s plain string, which then fails
    // validation against an object schema before the real body is even
    // looked at. (Found by an actual HTTP smoke test against
    // AuthController.login, which had the same bug — see that file's
    // history — then swept across every controller with this pattern.)
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
  ): Promise<BranchDto> {
    const db = this.connections.getClient(schema);
    const branch = await this.service.create(db, body);
    return branchSchema.parse(branch);
  }

  @Patch(':id')
  async update(
    @TenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchDto,
  ): Promise<BranchDto> {
    const db = this.connections.getClient(schema);
    const branch = await this.service.update(db, id, body);
    return branchSchema.parse(branch);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
