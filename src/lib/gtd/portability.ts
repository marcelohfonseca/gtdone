import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { currentVersion } from '../db/migrations.ts';
import { GtdError } from './core.ts';

export const EXPORT_FORMAT = 'gtdone-export';
export const EXPORT_VERSION = 1;

// Contas, sessões e controle de migração nunca entram no arquivo; segredos de integração também não.
const EXCLUDED_TABLES = new Set(['users', 'sessions', 'schema_migrations']);
const PRIVATE_SETTINGS_PREFIX = 'integration.';
const MAX_ROWS = 500_000;

type Column = { name: string; type: string; notnull: boolean; hasDefault: boolean; pk: boolean };
type Row = Record<string, string | number | null>;

export type ExportFile = {
	format: typeof EXPORT_FORMAT;
	version: number;
	schemaVersion: number;
	exportedAt: string;
	tables: Record<string, Row[]>;
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function columnsOf(db: DatabaseSync, table: string): Column[] {
	return db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((r) => ({
		name: String(r.name),
		type: String(r.type).toUpperCase(),
		notnull: Number(r.notnull) === 1,
		hasDefault: r.dflt_value != null,
		pk: Number(r.pk) > 0
	}));
}

// Tabelas ordenadas de modo que as referenciadas venham antes de quem as referencia.
function dataTables(db: DatabaseSync): string[] {
	const names = db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
		.all()
		.map((r) => String(r.name))
		.filter((n) => !EXCLUDED_TABLES.has(n) && !n.startsWith('items_fts'));
	const deps = new Map(
		names.map((n) => [
			n,
			db
				.prepare(`PRAGMA foreign_key_list(${quote(n)})`)
				.all()
				.map((r) => String(r.table))
				.filter((t) => t !== n && names.includes(t))
		])
	);
	const out: string[] = [];
	const visit = (n: string) => {
		if (out.includes(n)) return;
		for (const d of deps.get(n) ?? []) visit(d);
		out.push(n);
	};
	names.forEach(visit);
	return out;
}

function toRow(r: Record<string, unknown>): Row {
	return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v as string | number | null]));
}

export function exportData(db: DatabaseSync, now = new Date()): ExportFile {
	const tables: Record<string, Row[]> = {};
	for (const t of dataTables(db)) {
		const where = t === 'settings' ? ` WHERE key NOT LIKE '${PRIVATE_SETTINGS_PREFIX}%'` : '';
		tables[t] = db.prepare(`SELECT * FROM ${quote(t)}${where} ORDER BY rowid`).all().map(toRow);
	}
	return {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		schemaVersion: currentVersion(db),
		exportedAt: now.toISOString(),
		tables
	};
}

export function parseExport(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new GtdError('arquivo inválido: não é um JSON legível');
	}
}

function isPlain(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Validação estrutural completa, antes de qualquer escrita.
function validate(db: DatabaseSync, payload: unknown): Record<string, Row[]> {
	if (!isPlain(payload) || payload.format !== EXPORT_FORMAT) {
		throw new GtdError('arquivo inválido: não é uma exportação do GTDone');
	}
	if (payload.version !== EXPORT_VERSION) throw new GtdError('versão do arquivo não suportada');
	if (payload.schemaVersion !== currentVersion(db)) {
		throw new GtdError(
			`o arquivo foi gerado com outra versão do banco (${String(payload.schemaVersion)}); a atual é ${currentVersion(db)}`
		);
	}
	if (!isPlain(payload.tables)) throw new GtdError('arquivo inválido: tabelas ausentes');
	const tables = payload.tables as Record<string, unknown>;
	const known = dataTables(db);
	for (const name of Object.keys(tables)) {
		if (!known.includes(name)) throw new GtdError(`tabela desconhecida no arquivo: ${name}`);
	}
	let total = 0;
	const out: Record<string, Row[]> = {};
	for (const table of known) {
		const rows = tables[table];
		if (!Array.isArray(rows)) throw new GtdError(`tabela ausente no arquivo: ${table}`);
		total += rows.length;
		if (total > MAX_ROWS) throw new GtdError('arquivo grande demais');
		const cols = columnsOf(db, table);
		rows.forEach((row, i) => {
			const where = `${table}[${i}]`;
			if (!isPlain(row)) throw new GtdError(`linha inválida em ${where}`);
			for (const key of Object.keys(row)) {
				if (!cols.some((c) => c.name === key)) throw new GtdError(`coluna desconhecida em ${where}: ${key}`);
			}
			for (const c of cols) {
				const v = row[c.name];
				if (v === undefined || v === null) {
					if (c.notnull && !c.hasDefault) throw new GtdError(`valor obrigatório ausente em ${where}: ${c.name}`);
					continue;
				}
				const intCol = c.type.includes('INT');
				const ok =
					typeof v === 'number'
						? Number.isFinite(v) && (!intCol || Number.isInteger(v))
						: typeof v === 'string' && !intCol;
				if (!ok) throw new GtdError(`valor inválido em ${where}: ${c.name}`);
			}
			if (table === 'settings' && String(row.key).startsWith(PRIVATE_SETTINGS_PREFIX)) {
				throw new GtdError(`configuração reservada no arquivo: ${String(row.key)}`);
			}
		});
		out[table] = rows as Row[];
	}
	return out;
}

export type ImportSummary = Record<string, number>;

// Substitui os dados de GTD em uma única transação; qualquer falha desfaz tudo.
export function importData(db: DatabaseSync, payload: unknown, opts: { dryRun?: boolean } = {}): ImportSummary {
	const tables = validate(db, payload);
	const order = dataTables(db);
	db.exec('BEGIN;');
	try {
		for (const t of [...order].reverse()) {
			if (t === 'settings') {
				db.exec(`DELETE FROM settings WHERE key NOT LIKE '${PRIVATE_SETTINGS_PREFIX}%'`);
			} else db.exec(`DELETE FROM ${quote(t)}`);
		}
		for (const t of order) {
			for (const row of tables[t]) {
				const keys = Object.keys(row);
				if (keys.length === 0) continue;
				db.prepare(
					`INSERT INTO ${quote(t)} (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
				).run(...keys.map((k) => row[k] as SQLInputValue));
			}
		}
		if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
			throw new GtdError('arquivo inconsistente: há referências para registros inexistentes');
		}
		db.exec(opts.dryRun ? 'ROLLBACK;' : 'COMMIT;');
	} catch (e) {
		if (db.isTransaction) db.exec('ROLLBACK;');
		if (e instanceof GtdError) throw e;
		throw new GtdError(`arquivo rejeitado: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
	}
	return Object.fromEntries(order.map((t) => [t, tables[t].length]));
}
