# Operação do GTDone

Guia para rodar o GTDone numa máquina própria, acessível só pela VPN.

## 1. Instalação

```sh
sudo useradd --system --home /var/lib/gtdone --shell /usr/sbin/nologin gtdone
sudo install -d -o gtdone -g gtdone -m 700 /var/lib/gtdone
sudo mkdir -p /opt/gtdone /etc/gtdone
# na máquina de build: npm ci && npm run build; copie build/, package.json e package-lock.json para /opt/gtdone
sudo sh -c 'cd /opt/gtdone && npm ci --omit=dev'
sudo install -m 600 deploy/gtdone.env.example /etc/gtdone/gtdone.env   # edite os valores
sudo install -m 644 deploy/gtdone.service /etc/systemd/system/gtdone.service
sudo systemctl daemon-reload && sudo systemctl enable --now gtdone
```

O serviço reinicia sozinho (`Restart=always`) e sobe no boot. Requer Node 24 (`node:sqlite`).

## 2. VPN e HTTPS

1. Configure a VPN (ex.: WireGuard) e anote o IP da máquina na interface da VPN (ex.: `10.8.0.1`).
2. Mantenha o app em `HOST=127.0.0.1` e exponha só o proxy HTTPS nesse IP. Bloqueie a porta pública no firewall (`ufw allow in on wg0 to any port 443`; sem regra para a interface pública).
3. Use `deploy/Caddyfile` (certificado interno; instale a CA do Caddy nos dispositivos) ou outro proxy com certificado válido.
4. Defina `ORIGIN=https://<endereço>` no `.env`. Com isso o cookie de sessão sai com `Secure`. Sem proxy, `GTDONE_COOKIE_SECURE=1` força o atributo.

O e-mail de entrada (`/api/inbound-email`) é a única rota sem sessão além de login/setup; se usar, publique só esse caminho para o serviço de e-mail.

## 3. Segurança de acesso

- Login: 5 falhas em 15 min (por IP e por e-mail) bloqueiam por 15 min, com HTTP 429. O contador fica em memória e zera ao reiniciar.
- Sessões duram 30 dias; sair (logout) invalida a sessão no servidor e sessões expiradas são removidas a cada login.
- Logs (`journalctl -u gtdone`): uma linha por evento (`login.ok`, `login.failed`, `login.blocked`, `backup.ok`, `request.error`) com IP e rota. Nunca incluem senhas, tokens nem conteúdo de tarefas. Nível em `GTDONE_LOG_LEVEL`.

## 4. Backups

- O app gera um backup ao iniciar e a cada 24 h em `GTDONE_BACKUP_DIR`, mantendo `GTDONE_BACKUP_KEEP`. Cada backup passa por `PRAGMA integrity_check`; se falhar, é descartado e o erro aparece no log.
- Cópia externa: `deploy/backup-offsite.sh usuario@host:/destino` (rsync + verificação de integridade). Agende, por exemplo, diariamente:

```sh
# /etc/cron.d/gtdone-offsite
30 3 * * * gtdone GTDONE_BACKUP_DIR=/var/lib/gtdone/backups /opt/gtdone/deploy/backup-offsite.sh usuario@host:/srv/gtdone-backups
```

O destino deve ser outro dispositivo, com acesso por chave SSH restrita e retenção própria (ex.: snapshots semanais).
Exportações JSON em Preferências › Dados também servem como cópia lógica.

## 5. Restauração após falha

1. `sudo systemctl stop gtdone`
2. Escolha o backup (`ls /var/lib/gtdone/backups` ou o da cópia externa) e confirme: `node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('ARQUIVO',{readOnly:true}).prepare('PRAGMA integrity_check').all())"`
3. Guarde o banco atual (`mv gtdone.db gtdone.db.quebrado`, apague também `gtdone.db-wal` e `gtdone.db-shm`) e copie o backup para `GTDONE_DB_PATH`, com dono `gtdone`.
4. `sudo systemctl start gtdone` e confira `journalctl -u gtdone -n 50`.
5. Em máquina nova, repita a seção 1 antes do passo 3. As sessões não são perdidas, mas os backups são do estado do último dia: dados criados depois dele se perdem.

## 6. Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `GTDONE_DB_PATH` | `data/gtdone.db` | arquivo SQLite |
| `GTDONE_BACKUP_DIR` | `backups` ao lado do banco | pasta de backups |
| `GTDONE_BACKUP_KEEP` | `7` | backups mantidos |
| `GTDONE_LOG_LEVEL` | `info` | `info`, `warn` ou `error` |
| `GTDONE_COOKIE_SECURE` | — | `1` força cookie `Secure` |
| `ORIGIN`, `HOST`, `PORT`, `BODY_SIZE_LIMIT` | — | adapter-node |
| `GTDONE_SMTP_URL`, `GTDONE_MAIL_FROM` | — | e-mail do Foco |
