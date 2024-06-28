<div align="center">

# clickhouse-migrations

<a href="https://www.npmjs.com/package/@shini4i/clickhouse-migrations">
<img alt="NPM Version" src="https://img.shields.io/npm/v/%40shini4i%2Fclickhouse-migrations?color=%233178C6&logo=npm">
</a>
<a href="https://www.npmjs.com/package/@shini4i/clickhouse-migrations">
<img alt="NPM Downloads" src="https://img.shields.io/npm/dw/%40shini4i%2Fclickhouse-migrations?color=%233178C6&logo=npm">
</a>
<a href="https://codecov.io/gh/shini4i/clickhouse-migrations">
<img alt="CodeCov coverage" src="https://codecov.io/gh/shini4i/clickhouse-migrations/graph/badge.svg?token=8QWRD6EAQJ">
</a>
<a href="https://github.com/shini4i/clickhouse-migrations/blob/main/LICENSE">
<img alt="Project LICENSE" src="https://img.shields.io/github/license/shini4i/clickhouse-migrations">
</a>

</div>

## Install

```sh
npm install -g @shini4i/clickhouse-migrations
```

## Usage

Create a directory, where migrations will be stored. It will be used as the value for the `--migrations-home` option (or for environment variable `CH_MIGRATIONS_HOME`).

In the directory, create migration files, which should be named like this: `01_some_text.sql`, `02_other_text.sql`, `10_more_test.sql`. What's important here is that the migration version number should come first, followed by an underscore (`_`), and then any text can follow. The version number should increase for every next migration. Please note that once a migration file has been applied to the database, it cannot be modified or removed. 

For migrations' content should be used correct SQL ClickHouse queries. Multiple queries can be used in a single migration file, and each query should be terminated with a semicolon (;). The queries could be idempotent - for example: `CREATE TABLE IF NOT EXISTS table ...;` Clickhouse settings, that can be included at the query level, can be added like `SET allow_experimental_object_type = 1;`. For adding comments should be used `--`, `# `, `#!`. 

If the database provided in the `--db` option (or in `CH_MIGRATIONS_DB`) doesn't exist, it will be created automatically.

```
  Usage
    $ clickhouse-migrations migrate <options>

  Required flags
      --url=<url>                       Clickhouse URL (ex. https://clickhouse:8123)
      --user=<name>                     Username
      --db=<name>                       Database name
      --migrations-home=<dir>           Migrations' directory
      
  Optional flags
      --password=<password>             Password
      --engine=<engine>                 The engine to use for DB creation
      --request-timeout=<milliseconds>  Request timeout in milliseconds
    
  Environment variables
      Instead of options can be used environment variables.
      CH_MIGRATIONS_URL                 Clickhouse hostname (--url)
      CH_MIGRATIONS_USER                Username (--user)
      CH_MIGRATIONS_PASSWORD            Password (--password)
      CH_MIGRATIONS_DB                  Database name (--db)
      CH_MIGRATIONS_HOME                Migrations' directory (--migrations-home)
      CH_MIGRATIONS_ENGINE              The engine to use for DB creation (optional)
      CH_MIGRATIONS_REQUEST_TIMEOUT     Clickhouse client request timeout (optional)

  CLI examples
      clickhouse-migrations migrate --url=http://localhost:8123 
      --user=default --db=analytics 
      --migrations-home=/app/clickhouse/migrations

      clickhouse-migrations migrate 
```

Migration file example:
```
-- an example of migration file 01_init.sql

SET allow_experimental_object_type = 1;

CREATE TABLE IF NOT EXISTS events (
  event JSON
);
```
