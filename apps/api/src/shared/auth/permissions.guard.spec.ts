import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { ANY_PERMISSIONS_METADATA_KEY, PERMISSIONS_METADATA_KEY } from './require-permissions.decorator';

function contextFor(
  permissions: string[],
  metadata: Record<string, string[]>,
): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const handler = () => undefined;
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string] as unknown as never);
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('PermissionsGuard', () => {
  it('allows a route with no permission metadata', () => {
    const { context, reflector } = contextFor([], {});
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('requires every permission listed by RequirePermissions', () => {
    const { context, reflector } = contextFor(['a'], { [PERMISSIONS_METADATA_KEY]: ['a', 'b'] });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });

  it('accepts any one permission listed by RequireAnyPermission', () => {
    const { context, reflector } = contextFor(['sales.manage'], {
      [ANY_PERMISSIONS_METADATA_KEY]: ['inventory.manage', 'sales.manage'],
    });
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('rejects when the user has none of the RequireAnyPermission permissions', () => {
    const { context, reflector } = contextFor(['accounting.manage'], {
      [ANY_PERMISSIONS_METADATA_KEY]: ['inventory.manage', 'sales.manage'],
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});
