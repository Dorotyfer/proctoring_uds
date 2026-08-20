import mysql from 'mysql2/promise';

export function createMysqlPool(databaseUrl, options = {}) {
  return mysql.createPool({
    uri: databaseUrl,
    dateStrings: false,
    decimalNumbers: true,
    timezone: 'Z',
    multipleStatements: options.multipleStatements === true
  });
}
