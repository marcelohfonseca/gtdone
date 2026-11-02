import type { Mail } from '#lib/gtd/integrations.ts';

// Credenciais SMTP ficam só no ambiente (nunca no banco nem na exportação).
export function mailerConfigured(): boolean {
	return Boolean(process.env.GTDONE_SMTP_URL && process.env.GTDONE_MAIL_FROM);
}

export async function sendMail(mail: Mail): Promise<void> {
	if (!mailerConfigured()) throw new Error('SMTP não configurado (GTDONE_SMTP_URL e GTDONE_MAIL_FROM)');
	const nodemailer = await import('nodemailer');
	// `url` é aceito pelo nodemailer em tempo de execução, mas ausente dos tipos.
	const transport = nodemailer.createTransport({
		url: process.env.GTDONE_SMTP_URL,
		connectionTimeout: 10_000,
		socketTimeout: 20_000
	} as Parameters<typeof nodemailer.createTransport>[0]);
	try {
		await transport.sendMail({ from: process.env.GTDONE_MAIL_FROM, ...mail });
	} finally {
		transport.close();
	}
}
