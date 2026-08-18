const dependencies = [['MySQL', checkMySql]];

const mysqlConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number.parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'proctoring',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'proctoring',
  connectTimeout: 3000
};

async function checkMySql() {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection(mysqlConfig);

  try {
    await connection.query('SELECT 1');
  } finally {
    await connection.end().catch(() => {});
  }
}

const results = await Promise.allSettled(dependencies.map(([, check]) => check()));
const failedDependencies = results
  .map((result, index) => result.status === 'rejected' ? dependencies[index][0] : null)
  .filter(Boolean);

if (failedDependencies.length > 0) {
  console.error(`Unavailable dependencies: ${failedDependencies.join(', ')}`);
  process.exit(1);
}

console.log('Infrastructure dependency is available: MySQL');
