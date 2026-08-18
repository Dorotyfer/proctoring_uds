import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path, { delimiter } from 'node:path';

export class ConfigurationError extends Error {}

const requiredMySqlEnvironmentVariables = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD'
];

const requiredInfrastructureEnvironmentVariables = [
  ...requiredMySqlEnvironmentVariables,
  'EVIDENCE_STORAGE_PATH',
  'APACHE_DOCUMENT_ROOTS'
];

function getRequiredEnvironmentValues(environment, requiredVariables) {
  const missing = requiredVariables.filter((name) => {
    const value = environment[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return environment;
}

export function createMySqlConfig(environment = process.env) {
  const values = getRequiredEnvironmentValues(
    environment,
    requiredMySqlEnvironmentVariables
  );
  const portValue = values.MYSQL_PORT.trim();

  if (!/^\d+$/.test(portValue)) {
    throw new ConfigurationError('MYSQL_PORT must be an integer between 1 and 65535');
  }

  const port = Number(portValue);
  if (port < 1 || port > 65535) {
    throw new ConfigurationError('MYSQL_PORT must be an integer between 1 and 65535');
  }

  return {
    host: values.MYSQL_HOST.trim(),
    port,
    user: values.MYSQL_USER.trim(),
    password: values.MYSQL_PASSWORD,
    database: values.MYSQL_DATABASE.trim(),
    connectTimeout: 3000
  };
}

function isWithinDirectory(parentPath, candidatePath, pathModule) {
  const relativePath = pathModule.relative(parentPath, candidatePath);
  return relativePath === '' || (
    !relativePath.startsWith('..') && !pathModule.isAbsolute(relativePath)
  );
}

async function getExistingDirectory(fileSystem, directoryPath, errorMessage) {
  try {
    const directory = await fileSystem.stat(directoryPath);
    if (!directory.isDirectory()) {
      throw new Error('not a directory');
    }

    return await fileSystem.realpath(directoryPath);
  } catch {
    throw new ConfigurationError(errorMessage);
  }
}

async function validateEvidenceStorage(fileSystem, evidenceStoragePath) {
  const resolvedPath = await getExistingDirectory(
    fileSystem,
    evidenceStoragePath,
    'EVIDENCE_STORAGE_PATH must exist and be a directory'
  );

  try {
    await fileSystem.access(resolvedPath, constants.W_OK);
  } catch {
    throw new ConfigurationError('EVIDENCE_STORAGE_PATH must be writable by the API worker');
  }

  return resolvedPath;
}

export async function createInfrastructureConfig(
  environment = process.env,
  {
    fileSystem = { access, realpath, stat },
    pathDelimiter = delimiter,
    pathModule = path
  } = {}
) {
  const values = getRequiredEnvironmentValues(
    environment,
    requiredInfrastructureEnvironmentVariables
  );
  const mysql = createMySqlConfig(values);
  const evidenceStoragePath = await validateEvidenceStorage(
    fileSystem,
    values.EVIDENCE_STORAGE_PATH.trim()
  );
  const apacheDocumentRoots = values.APACHE_DOCUMENT_ROOTS
    .split(pathDelimiter)
    .map((directory) => directory.trim())
    .filter(Boolean);

  if (apacheDocumentRoots.length === 0) {
    throw new ConfigurationError('APACHE_DOCUMENT_ROOTS must list every Apache public path');
  }

  const resolvedApacheDocumentRoots = await Promise.all(
    apacheDocumentRoots.map((directory) => getExistingDirectory(
      fileSystem,
      directory,
      'Every APACHE_DOCUMENT_ROOTS entry must exist and be a directory'
    ))
  );

  if (resolvedApacheDocumentRoots.some((directory) => (
    isWithinDirectory(directory, evidenceStoragePath, pathModule)
  ))) {
    throw new ConfigurationError(
      'EVIDENCE_STORAGE_PATH must be outside APACHE_DOCUMENT_ROOTS'
    );
  }

  return { evidenceStoragePath, mysql };
}
