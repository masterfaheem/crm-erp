import mysql, { Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var _technoxPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global._technoxPool) {
    global._technoxPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,

      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,

      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      idleTimeout: 60000,
      maxIdle: 10,

      connectTimeout: 20000,

      charset: "utf8mb4",
      timezone: "+05:00",
    });
  }

  return global._technoxPool;
}

export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows as T;
}

