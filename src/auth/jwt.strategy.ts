import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { UserService } from '@/user/user.service'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private configService: ConfigService,
		private userService: UserService
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKeyProvider: (request, rawJwtToken, done) => {
				const secret =
					this.configService.get<string>('JWT_SECRET') || 'your-secret-key'
				done(null, secret)
			},
		})
	}

	async validate(payload: { id: string }) {
		const user = await this.userService.getById(payload.id)
		if (!user) {
			throw new UnauthorizedException('User not found')
		}
		return user
	}
}
