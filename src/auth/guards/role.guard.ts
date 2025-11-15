import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RoleGuard implements CanActivate {
	constructor(private reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const required = this.reflector.getAllAndOverride<'ADMIN'>('roles', [
			context.getHandler(),
			context.getClass(),
		])
		if (!required) return true
		const { user } = context.switchToHttp().getRequest()
		return user.role === 'ADMIN'
	}
}
