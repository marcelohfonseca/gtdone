// Log operacional em uma linha por evento. Nunca registre senhas, tokens nem conteúdo das tarefas.
type Level = 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { info: 0, warn: 1, error: 2 };

function threshold(): number {
	const v = (process.env.GTDONE_LOG_LEVEL ?? 'info').toLowerCase();
	return v in ORDER ? ORDER[v as Level] : 0;
}

export function log(level: Level, event: string, fields: Record<string, string | number | boolean | null> = {}): void {
	if (ORDER[level] < threshold()) return;
	const extra = Object.entries(fields)
		.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
		.join(' ');
	const line = `${new Date().toISOString()} ${level.toUpperCase()} ${event}${extra ? ' ' + extra : ''}`;
	(level === 'info' ? console.log : level === 'warn' ? console.warn : console.error)(line);
}
