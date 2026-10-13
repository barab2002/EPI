import { DataSource } from 'typeorm';
import { InitialSchema1760300000000 } from './migrations/1760300000000-initial-schema';
import { OidcLogin1760400000000 } from './migrations/1760400000000-oidc-login';
import { StatusMappings1760500000000 } from './migrations/1760500000000-status-mappings';
import { SourceAccounts1760600000000 } from './migrations/1760600000000-source-accounts';
import { AppSettings1760700000000 } from './migrations/1760700000000-app-settings';
import { DirectoryMappings1760800000000 } from './migrations/1760800000000-directory-mappings';

export const MIGRATIONS = [
  InitialSchema1760300000000,
  OidcLogin1760400000000,
  StatusMappings1760500000000,
  SourceAccounts1760600000000,
  AppSettings1760700000000,
  DirectoryMappings1760800000000,
];

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    migrations: MIGRATIONS,
    migrationsTableName: 'epi_migrations',
    migrationsTransactionMode: 'each',
    synchronize: false,
    logging: ['error'],
  });
}

export const DATA_SOURCE = Symbol('DATA_SOURCE');
