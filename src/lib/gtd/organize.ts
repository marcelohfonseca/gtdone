import type { DatabaseSync } from 'node:sqlite';
import { GtdError } from './core.ts';

export const NAMED_KINDS = ['areas', 'tags', 'contacts'] as const;
export type NamedKind = (typeof NAMED_KINDS)[number];
export type Named = { id: number; name: string; color?: string | null };

export function isNamedKind(v: string): v is NamedKind {
	return (NAMED_KINDS as readonly string[]).includes(v);
}

const TABLE: Record<NamedKind, string> = { areas: 'areas', tags: 'tags', contacts: 'contacts' };

function cleanName(name: unknown): string {
	const n = String(name ?? '').trim();
	if (!n) throw new GtdError('informe um nome');
	return n;
}

function assertUnique(db: DatabaseSync, kind: NamedKind, name: string, exceptId = 0) {
	const row = db
		.prepare(`SELECT id FROM ${TABLE[kind]} WHERE lower(name) = lower(?) AND id != ?`)
		.get(name, exceptId);
	if (row) throw new GtdError('já existe com esse nome');
}

export function listNamed(db: DatabaseSync, kind: NamedKind): Named[] {
	const order = kind === 'areas' ? 'position, id' : 'name COLLATE NOCASE';
	return db
		.prepare(`SELECT id, name, color FROM ${TABLE[kind]} ORDER BY ${order}`)
		.all()
		.map((r) => ({ id: Number(r.id), name: String(r.name), color: r.color == null ? null : String(r.color) }));
}

export function createNamed(db: DatabaseSync, kind: NamedKind, name: unknown): number {
	const n = cleanName(name);
	assertUnique(db, kind, n);
	const now = Date.now();
	if (kind === 'areas') {
		const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM areas').get();
		return Number(
			db
				.prepare('INSERT INTO areas (name, position, created_at, updated_at) VALUES (?, ?, ?, ?)')
				.run(n, Number(pos?.p ?? 0), now, now).lastInsertRowid
		);
	}
	return Number(
		db
			.prepare(`INSERT INTO ${TABLE[kind]} (name, created_at, updated_at) VALUES (?, ?, ?)`)
			.run(n, now, now)
			.lastInsertRowid
	);
}

export function renameNamed(db: DatabaseSync, kind: NamedKind, id: number, name: unknown): void {
	const n = cleanName(name);
	assertUnique(db, kind, n, id);
	db.prepare(`UPDATE ${TABLE[kind]} SET name = ?, updated_at = ? WHERE id = ?`).run(n, Date.now(), id);
}

export function setNamedColor(db: DatabaseSync, kind: NamedKind, id: number, color: unknown): void {
	const c = String(color ?? '').trim();
	if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw new GtdError('cor inválida');
	db.prepare(`UPDATE ${TABLE[kind]} SET color = ?, updated_at = ? WHERE id = ?`).run(c ? c.toLowerCase() : null, Date.now(), id);
}

export function deleteNamed(db: DatabaseSync, kind: NamedKind, id: number): void {
	db.prepare(`DELETE FROM ${TABLE[kind]} WHERE id = ?`).run(id);
}

export function parseTagNames(csv: unknown): string[] {
	const seen = new Map<string, string>();
	for (const part of String(csv ?? '').split(',')) {
		const t = part.trim().replace(/^#/, '');
		if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
	}
	return [...seen.values()];
}

export type TagField = { areaId: number | null; contactId: number | null; tags: string };

// Campo único de tags: "!área", "@pessoa", "#contexto"; sem prefixo vale o cadastro existente
// (área, pessoa, contexto) ou cria um contexto. Nomes que não existem são criados.
export function resolveTagField(db: DatabaseSync, csv: unknown, allowContacts = true): TagField {
	const out: TagField = { areaId: null, contactId: null, tags: '' };
	const contexts: string[] = [];
	const find = (kind: NamedKind, name: string) =>
		listNamed(db, kind).find((e) => e.name.toLowerCase() === name.toLowerCase());
	const ensure = (kind: NamedKind, name: string) => find(kind, name)?.id ?? createNamed(db, kind, name);
	for (const raw of String(csv ?? '').split(',')) {
		const token = raw.trim();
		const prefix = /^[!@#]/.test(token) ? token[0] : '';
		const name = token.replace(/^[!@#]+/, '').trim();
		if (!name) continue;
		const kind: NamedKind | null =
			prefix === '!' ? 'areas' : prefix === '@' ? 'contacts' : prefix === '#' ? 'tags' : find('areas', name) ? 'areas' : allowContacts && find('contacts', name) ? 'contacts' : 'tags';
		if (kind === 'areas') out.areaId ??= ensure('areas', name);
		else if (kind === 'contacts') {
			if (allowContacts) out.contactId ??= ensure('contacts', name);
		} else if (!contexts.some((c) => c.toLowerCase() === name.toLowerCase())) contexts.push(name);
	}
	out.tags = contexts.join(',');
	return out;
}

export function ensureTagIds(db: DatabaseSync, names: string[]): number[] {
	return names.map((name) => {
		const found = db.prepare('SELECT id FROM tags WHERE lower(name) = lower(?)').get(name);
		if (found) return Number(found.id);
		return createNamed(db, 'tags', name);
	});
}

export function getSetting(db: DatabaseSync, key: string): string | null {
	const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
	return r ? String(r.value) : null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
	db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	).run(key, value);
}
