import type { ClickHouseClient } from '@clickhouse/client';
import { ClickHouseClientConfigOptions } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';
import { Command } from 'commander';
import fs from 'fs';
import crypto from 'crypto';

import { sql_queries, sql_sets } from './sql-parse';

const log = (type: 'info' | 'error' = 'info', message: string, error?: string) => {
  if (type === 'info') {
    console.log('\x1b[36m', `clickhouse-migrations :`, '\x1b[0m', message);
  } else {
    console.error('\x1b[36m', `clickhouse-migrations :`, '\x1b[31m', `Error: ${message}`, error ? `\n\n ${error}` : '');
  }
};

const connect = (url: string, username: string, password?: string, db_name?: string, requestTimeout?: number): ClickHouseClient => {
  const db_params: ClickHouseClientConfigOptions = {
    url,
    username,
    password,
    application: 'clickhouse-migrations',
  };

  if (db_name) {
    db_params.database = db_name;
  }

  if (requestTimeout) {
    db_params.request_timeout = requestTimeout;
  }

  return createClient(db_params);
};

const create_db = async (url: string, username: string, db_name: string, password?: string, engine?: string, requestTimeout?: number): Promise<void> => {
  const client = connect(url, username, password, "", requestTimeout);

  let q = `CREATE DATABASE IF NOT EXISTS "${db_name}"`;
  q += engine ? ` ENGINE = ${engine}` : '';

  try {
    await client.exec({
      query: q,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
  } catch (e: unknown) {
    log('error', `can't create the database ${db_name}.`, (e as QueryError).message);
    process.exit(1);
  }

  await client.close();
};

const init_migration_table = async (client: ClickHouseClient): Promise<void> => {
  const q = `CREATE TABLE IF NOT EXISTS _migrations (
      uid UUID DEFAULT generateUUIDv4(), 
      version UInt32,
      checksum String, 
      migration_name String, 
      applied_at DateTime DEFAULT now()
    ) 
    ENGINE = MergeTree 
    ORDER BY tuple(applied_at)`;

  try {
    await client.exec({
      query: q,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
  } catch (e: unknown) {
    log('error', `can't create the _migrations table.`, (e as QueryError).message);
    process.exit(1);
  }
};

const get_migrations = (migrations_home: string): { version: number; file: string }[] => {
  let files;
  try {
    files = fs.readdirSync(migrations_home);
  } catch (e: unknown) {
    log('error', `no migration directory ${migrations_home}. Please create it.`);
    process.exit(1);
  }

  const migrations: MigrationBase[] = [];
  files.forEach((file: string) => {
    const version = Number(file.split('_')[0]);

    if (!version) {
      log(
        'error',
        `a migration name should start from number, example: 1_init.sql. Please check, if the migration ${file} is named correctly`,
      );
      process.exit(1);
    }

    // Manage only .sql files.
    if (!file.endsWith('.sql')) return;

    migrations.push({
      version,
      file,
    });
  });

  if (!migrations) {
    log('error', `no migrations in the ${migrations_home} migrations directory`);
  }

  // Order by version.
  migrations.sort((m1, m2) => m1.version - m2.version);

  return migrations;
};

const apply_migrations = async (
  client: ClickHouseClient,
  migrations: MigrationBase[],
  migrations_home: string,
): Promise<void> => {
  let migration_query_result: MigrationsRowData[] = [];
  try {
    const resultSet = await client.query({
      query: `SELECT version, checksum, migration_name FROM _migrations ORDER BY version`,
      format: 'JSONEachRow',
    });
    migration_query_result = await resultSet.json();
  } catch (e: unknown) {
    log('error', `can't select data from the _migrations table.`, (e as QueryError).message);
    process.exit(1);
  }

  const migrations_applied: MigrationsRowData[] = [];
  migration_query_result.forEach((row: MigrationsRowData) => {
    migrations_applied[row.version] = {
      version: row.version,
      checksum: row.checksum,
      migration_name: row.migration_name,
    };

    // Check if migration file was not removed after apply.
    const migration_exist = migrations.find(({ version }) => version === row.version);
    if (!migration_exist) {
      log(
        'error',
        `a migration file shouldn't be removed after apply. Please, restore the migration ${row.migration_name}.`,
      );
      process.exit(1);
    }
  });

  let applied_migrations = '';

  for (const migration of migrations) {
    const content = fs.readFileSync(migrations_home + '/' + migration.file).toString();
    const checksum = crypto.createHash('md5').update(content).digest('hex');

    if (migrations_applied[migration.version]) {
      // Check if migration file was not changed after apply.
      if (migrations_applied[migration.version].checksum !== checksum) {
        log(
          'error',
          `a migration file should't be changed after apply. Please, restore content of the ${
            migrations_applied[migration.version].migration_name
          } migrations.`,
        );
        process.exit(1);
      }

      // Skip if a migration is already applied.
      continue;
    }

    // Extract sql from the migration.
    const queries = sql_queries(content);
    const sets = sql_sets(content);

    for (const query of queries) {
      try {
        await client.exec({
          query: query,
          clickhouse_settings: sets,
        });
      } catch (e: unknown) {
        if (applied_migrations) {
          log('info', `The migration(s) ${applied_migrations} was successfully applied!`);
        }

        log(
          'error',
          `the migrations ${migration.file} has an error. Please, fix it (be sure that already executed parts of the migration would not be run second time) and re-run migration script.`,
          (e as QueryError).message,
        );
        process.exit(1);
      }
    }

    try {
      await client.insert({
        table: '_migrations',
        values: [{ version: migration.version, checksum: checksum, migration_name: migration.file }],
        format: 'JSONEachRow',
      });
    } catch (e: unknown) {
      log('error', `can't insert a data into the table _migrations.`, (e as QueryError).message);
      process.exit(1);
    }

    applied_migrations = applied_migrations ? applied_migrations + ', ' + migration.file : migration.file;
  }

  if (applied_migrations) {
    log('info', `The migration(s) ${applied_migrations} was successfully applied!`);
  } else {
    log('info', `No migrations to apply.`);
  }
};

const migration = async (
  migrations_home: string,
  url: string,
  username: string,
  db_name: string,
  password?: string,
  engine?: string,
  requestTimeout?: number
): Promise<void> => {
  const migrations = get_migrations(migrations_home);

  await create_db(url, username, db_name, password, engine, requestTimeout);

  const client = connect(url, username, password, db_name, requestTimeout);

  await init_migration_table(client);

  await apply_migrations(client, migrations, migrations_home);

  await client.close();
};

const migrate = () => {
  const program = new Command();

  program.name('clickhouse-migrations').description('ClickHouse migrations.').version('0.1.15');

  program
    .command('migrate')
    .description('Apply migrations.')
    .requiredOption('--url <url>', 'Clickhouse URL (ex: http://clickhouse:8123)', process.env.CH_MIGRATIONS_URL)
    .requiredOption('--user <name>', 'Username', process.env.CH_MIGRATIONS_USER)
    .requiredOption('--db <name>', 'Database name', process.env.CH_MIGRATIONS_DB)
    .requiredOption('--migrations-home <dir>', "Migrations' directory", process.env.CH_MIGRATIONS_HOME)
    .option('--password <password>', 'Password', process.env.CH_MIGRATIONS_PASSWORD)
    .option('--engine <name>', 'Engine name', process.env.CH_MIGRATIONS_ENGINE)
    .option("--request-timeout <milliseconds>", "Request timeout", process.env.CH_MIGRATIONS_REQUEST_TIMEOUT)
    .action(async (options: CliParameters) => {
      options.requestTimeout = options.requestTimeout ? Number(options.requestTimeout) : undefined;
      await migration(options.migrationsHome, options.url, options.user, options.db, options.password, options.engine, options.requestTimeout);
    });

  program.parse();
};

export { migrate, migration };
