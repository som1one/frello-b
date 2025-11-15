import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '@/auth/auth.module' // Используем forwardRef для разрешения циклической зависимости
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { PrismaService } from '@/prisma.service'

@Module({
	imports: [
		forwardRef(() => AuthModule), // Используем forwardRef здесь
	],
	controllers: [UserController],
	providers: [UserService, PrismaService],
	exports: [UserService],
})
export class UserModule {}
