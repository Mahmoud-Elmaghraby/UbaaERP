import { createReadStream } from 'node:fs';
import { Controller, Get, Inject, NotFoundException, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOCAL_FILES_ROUTE, LocalObjectStorage } from './local-object-storage';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';

/**
 * Serves files for LocalObjectStorage's signed links (`/files/<key>?expires&signature`).
 * Unauthenticated on purpose — exactly like a MinIO presigned URL, the
 * signature *is* the authorization (an <img src> can't send a bearer token).
 * Returns 404 for everything when the active storage is not the local one.
 */
@Controller(LOCAL_FILES_ROUTE)
export class LocalFilesController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Get('*')
  async download(
    @Req() req: Request,
    @Res() res: Response,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
  ): Promise<void> {
    if (!(this.storage instanceof LocalObjectStorage)) throw new NotFoundException();

    const prefix = `/${LOCAL_FILES_ROUTE}/`;
    const rawKey = req.path.startsWith(prefix) ? req.path.slice(prefix.length) : '';
    const key = rawKey.split('/').map(decodeURIComponent).join('/');

    const file = await this.storage.open(key, Number(expires), signature);
    if (!file) throw new NotFoundException();

    res.setHeader('Content-Type', file.meta.contentType);
    res.setHeader('Cache-Control', file.meta.cacheControl ?? 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(file.path).pipe(res);
  }
}
