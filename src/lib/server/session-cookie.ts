import { SESSION_COOKIE, SESSION_MAX_AGE_S } from '#lib/auth/constants.ts';

// `secure` quando a URL é https (defina ORIGIN=https://… atrás de proxy) ou GTDONE_COOKIE_SECURE=1.
export function secureCookies(url: URL): boolean {
	return url.protocol === 'https:' || process.env.GTDONE_COOKIE_SECURE === '1';
}

export function setSessionCookie(
	cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void },
	url: URL,
	token: string
): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(url),
		maxAge: SESSION_MAX_AGE_S
	});
}
