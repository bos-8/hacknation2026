#!/bin/sh
set -eu

# Runs in the owning PostgreSQL container: first-boot socket or explicit runtime PGHOST.
export PGUSER="${POSTGRES_USER:?Required}"
export PGPASSWORD="${POSTGRES_PASSWORD:?Required}"
export PGDATABASE=postgres

# Runs against fresh and existing volumes; existing passwords and database owners are preserved.
test "$DB_APP_DATABASE_NAME" != "$DB_AUTH_DATABASE_NAME"
test "$DB_APP_USERNAME" != "$DB_AUTH_USERNAME"
test "$DB_APP_USERNAME" != "$PGUSER"
test "$DB_AUTH_USERNAME" != "$PGUSER"
for connection_limit in "$DB_APP_CONNECTION_LIMIT" "$DB_AUTH_CONNECTION_LIMIT"; do
  case "$connection_limit" in ''|*[!0-9]*) echo 'Connection limits must be positive integers' >&2; exit 1;; esac
  test "$connection_limit" -gt 0
done

psql -X --set=ON_ERROR_STOP=1 <<'SQL'
SELECT current_setting('server_version_num')::int = 180006 AS supported_version \gset
\if :supported_version
\else
  \echo 'PostgreSQL 18.6 is required. Migrate older data into a new volume; do not reuse its PGDATA.'
  \quit 1
\endif

\getenv app_db DB_APP_DATABASE_NAME
\getenv app_user DB_APP_USERNAME
\getenv app_password DB_APP_PASSWORD
\getenv auth_db DB_AUTH_DATABASE_NAME
\getenv auth_user DB_AUTH_USERNAME
\getenv auth_password DB_AUTH_PASSWORD
\getenv app_limit DB_APP_CONNECTION_LIMIT
\getenv auth_limit DB_AUTH_CONNECTION_LIMIT

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'auth_user', :'auth_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'auth_user') \gexec

-- Fail before granting access if an existing account has elevated privileges or inherited roles.
SELECT EXISTS (
  SELECT FROM pg_roles r WHERE r.rolname IN (:'app_user', :'auth_user')
  AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
    OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid))
) AS unsafe_roles \gset
\if :unsafe_roles
  \echo 'Refusing elevated accounts or inherited roles for application/authentication databases'
  \quit 1
\endif

SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'app_db', :'app_user', 'UTF8')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_db') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'auth_db', :'auth_user', 'UTF8')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'auth_db') \gexec

SELECT EXISTS (
  SELECT FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
  WHERE (d.datname = :'app_db' AND r.rolname <> :'app_user')
     OR (d.datname = :'auth_db' AND r.rolname <> :'auth_user')
) AS unexpected_owners \gset
\if :unexpected_owners
  \echo 'Database owner differs from configuration; refusing ownership transfer'
  \quit 1
\endif

REVOKE ALL ON DATABASE :"app_db", :"auth_db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"app_db" FROM :"auth_user";
REVOKE ALL ON DATABASE :"auth_db" FROM :"app_user";
GRANT CONNECT, TEMPORARY ON DATABASE :"app_db" TO :"app_user";
GRANT CONNECT, TEMPORARY ON DATABASE :"auth_db" TO :"auth_user";
ALTER ROLE :"app_user" CONNECTION LIMIT :app_limit;
ALTER ROLE :"auth_user" CONNECTION LIMIT :auth_limit;
SQL

# Verify credentials rather than silently rotating an existing role's password.
PGUSER="$DB_APP_USERNAME" PGPASSWORD="$DB_APP_PASSWORD" PGDATABASE="$DB_APP_DATABASE_NAME" \
  psql -X --set=ON_ERROR_STOP=1 --command='REVOKE CREATE ON SCHEMA public FROM PUBLIC; SELECT 1;' >/dev/null
PGUSER="$DB_AUTH_USERNAME" PGPASSWORD="$DB_AUTH_PASSWORD" PGDATABASE="$DB_AUTH_DATABASE_NAME" \
  psql -X --set=ON_ERROR_STOP=1 --command='REVOKE CREATE ON SCHEMA public FROM PUBLIC; SELECT 1;' >/dev/null
echo 'Application and authentication databases are ready; existing credentials preserved.'
