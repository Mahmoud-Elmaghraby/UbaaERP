import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UsePipes } from '@nestjs/common';
import {
  allocateNextRequestSchema,
  allocatedDocumentNumberSchema,
  createNumberingSequenceSchema,
  numberingSequenceSchema,
  updateNumberingSequenceSchema,
  type AllocateNextRequestDto,
  type AllocatedDocumentNumberDto,
  type CreateNumberingSequenceDto,
  type NumberingSequenceDto,
  type UpdateNumberingSequenceDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { NumberingSequencesService } from '../application/services/numbering-sequences.service';

// Permission gap: see the note at the top of settings.controller.ts.
@Controller('numbering-sequences')
export class NumberingSequencesController {
  constructor(
    private readonly service: NumberingSequencesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@TenantSchema() schema: string): Promise<NumberingSequenceDto[]> {
    const db = this.connections.getClient(schema);
    const sequences = await this.service.list(db);
    return sequences.map((s) => numberingSequenceSchema.parse(s));
  }

  @Get(':id')
  async getById(
    @TenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<NumberingSequenceDto> {
    const db = this.connections.getClient(schema);
    const sequence = await this.service.getById(db, id);
    return numberingSequenceSchema.parse(sequence);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createNumberingSequenceSchema))
  async create(
    @TenantSchema() schema: string,
    @Body() body: CreateNumberingSequenceDto,
  ): Promise<NumberingSequenceDto> {
    const db = this.connections.getClient(schema);
    const sequence = await this.service.create(db, body);
    return numberingSequenceSchema.parse(sequence);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateNumberingSequenceSchema))
  async update(
    @TenantSchema() schema: string,
    @Param('id') id: string,
    @Body() body: UpdateNumberingSequenceDto,
  ): Promise<NumberingSequenceDto> {
    const db = this.connections.getClient(schema);
    const sequence = await this.service.update(db, id, body);
    return numberingSequenceSchema.parse(sequence);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }

  /**
   * Claims the next number for a document type (used by later modules —
   * Sales, Purchases — once they exist; exposed here too so it's testable
   * and usable standalone today).
   */
  @Post('allocate-next')
  @UsePipes(new ZodValidationPipe(allocateNextRequestSchema))
  async allocateNext(
    @TenantSchema() schema: string,
    @Body() body: AllocateNextRequestDto,
  ): Promise<AllocatedDocumentNumberDto> {
    const db = this.connections.getClient(schema);
    const allocated = await this.service.allocateNext(db, body.documentType, body.branchId ?? null);
    return allocatedDocumentNumberSchema.parse(allocated);
  }
}
