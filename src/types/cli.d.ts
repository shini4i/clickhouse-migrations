/// <reference types="node" />

type MigrationBase = {
  version: number;
  file: string;
};

type MigrationsRowData = {
  version: number;
  checksum: string;
  migration_name: string;
};

type CliParameters = {
  migrationsHome: string;
  url: string;
  user: string;
  db: string;
  password?: string;
  engine?: string;
  requestTimeout?: number;
};

type QueryError = {
  message: string;
};
