

export function stripHtml(text: string): string {
	return text.replace(/<\/?[^>]+(>|$)/g, '')
}