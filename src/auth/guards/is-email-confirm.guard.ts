import {
	Injectable,
	CanActivate,
	ExecutionContext,
	UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '@/prisma.service'

@Injectable()
export class IsEmailConfirmedGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const publicRoutes = [
			'/api/auth/register',
			'/api/auth/verify-email',
			'/api/auth/resend-otp',
			'/api/auth/login',
			'/api/auth/login/access-token',
		]
		if (publicRoutes.includes(request.path)) {
			return true
		}

		if (!request.user || typeof request.user.id === 'undefined') {
			throw new UnauthorizedException('User not found or not authorized')
		}

		const userId = request.user.id

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { isActivated: true },
		})

		if (!user || !user.isActivated) {
			throw new UnauthorizedException('Email не подтверждён')
		}

		return true
	}
}
