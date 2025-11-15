// Файл: prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
	await prisma.subscriptionPlan.createMany({
		data: [
			{ name: 'Monthly', duration: 30, price: 1000 },
			{ name: '3 Months', duration: 90, price: 1800 },
			{ name: '6 Months', duration: 180, price: 3500 },
			{ name: '12 Months', duration: 360, price: 6500 },
		],
		skipDuplicates: true,
	})
}

main()
	.catch(e => console.error(e))
	.finally(async () => await prisma.$disconnect())
