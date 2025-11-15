import { SetMetadata } from '@nestjs/common'
export const Roles = (...roles: 'ADMIN'[]) => SetMetadata('roles', roles)
