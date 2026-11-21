#!/bin/sh
set -eu
export PGUSER="${POSTGRES_USER:?Required}"
export PGPASSWORD="${POSTGRES_PASSWORD:?Required}"
export PGDATABASE=postgres
export PGHOST="${PGHOST:-127.0.0.1}"
test "$DB_QUEUE_USERNAME" != "$POSTGRES_USER"
test "$DB_QUEUE_USERNAME" != "$DB_APP_USERNAME"
test "$DB_QUEUE_USERNAME" != "$DB_AUTH_USERNAME"
test "$DB_QUEUE_DATABASE_NAME" != "$DB_APP_DATABASE_NAME"
test "$DB_QUEUE_DATABASE_NAME" != "$DB_AUTH_DATABASE_NAME"
case "$DB_QUEUE_CONNECTION_LIMIT" in ''|*[!0-9]*) exit 1;; esac
test "$DB_QUEUE_CONNECTION_LIMIT" -gt 0
psql -X --set=ON_ERROR_STOP=1 <<'SQL'
\getenv queue_db DB_QUEUE_DATABASE_NAME
\getenv queue_user DB_QUEUE_USERNAME
\getenv queue_password DB_QUEUE_PASSWORD
\getenv queue_limit DB_QUEUE_CONNECTION_LIMIT
\getenv app_db DB_APP_DATABASE_NAME
\getenv auth_db DB_AUTH_DATABASE_NAME
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'queue_user', :'queue_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'queue_user') \gexec
SELECT EXISTS (SELECT FROM pg_roles r WHERE rolname = :'queue_user' AND
  (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid))) AS unsafe \gset
\if :unsafe
  \echo 'Refusing an elevated queue role'
  \quit 1
\endif
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'queue_db', :'queue_user', 'UTF8')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'queue_db') \gexec
SELECT EXISTS (SELECT FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = :'queue_db' AND r.rolname <> :'queue_user') AS wrong_owner \gset
\if :wrong_owner
  \echo 'Refusing to transfer queue database ownership'
  \quit 1
\endif
REVOKE ALL ON DATABASE :"queue_db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"app_db", :"auth_db" FROM :"queue_user";
GRANT CONNECT, TEMPORARY ON DATABASE :"queue_db" TO :"queue_user";
ALTER ROLE :"queue_user" CONNECTION LIMIT :queue_limit;
SQL
PGUSER="$DB_QUEUE_USERNAME" PGPASSWORD="$DB_QUEUE_PASSWORD" PGDATABASE="$DB_QUEUE_DATABASE_NAME" \
  psql -X --set=ON_ERROR_STOP=1 --command='REVOKE CREATE ON SCHEMA public FROM PUBLIC; SELECT 1;' >/dev/null
echo 'Queue database ready; existing credentials preserved.'
