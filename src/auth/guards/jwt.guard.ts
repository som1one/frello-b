import { AuthGuard } from '@nestjs/passport'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

export class JwtAuthGuard extends AuthGuard('jwt') {
	handleRequest(err, user, info, context: ExecutionContext) {
		const req = context.switchToHttp().getRequest()
		if (err || !user) {
			throw err || new UnauthorizedException('Неверный или отсутствующий токен')
		}
		return user
	}
}
