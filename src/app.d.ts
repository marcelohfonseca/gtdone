import type { Session } from '#lib/auth/sessions.ts';

declare global {
	namespace App {
		interface Locals {
			session: Session | null;
		}
	}
}

export {};
