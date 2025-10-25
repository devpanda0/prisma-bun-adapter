import { describe, expect, it } from "bun:test";
import { BunPostgresAdapter } from "../src/optimized-index.ts";

const TEST_URL = "postgresql://user:pass@localhost:5432/testdb";

type RecordedCall = {
  sql: string;
  values: any[];
  type: "connection" | "reserved" | "release";
};

function installFakeBun() {
  const calls: RecordedCall[] = [];

  const makeResult = (values: any[]): any => {
    const row = values.length ? { value: values[0] } : {};
    const result: any = [row];
    result.count = 1;
    result.command = "SELECT";
    result.lastInsertRowid = null;
    result.affectedRows = 1;
    return result;
  };

  const joinSql = (strings: TemplateStringsArray, values: any[]): string => {
    let sql = "";
    for (let i = 0; i < strings.length; i++) {
      sql += strings[i];
      if (i < values.length) {
        sql += `__arg${i}__`;
      }
    }
    return sql.trim();
  };

  class FakeSql {
    constructor() {
      const handler: any = async (
        strings: TemplateStringsArray,
        ...values: any[]
      ) => {
        calls.push({ type: "connection", sql: joinSql(strings, values), values: [...values] });
        return makeResult(values);
      };

      handler.close = async () => {};
      handler.end = async () => {};
      handler.begin = async () => handler;
      handler.transaction = async (cb: any) => cb(handler);
      handler.reserve = async () => {
        const reserved: any = async (
          strings: TemplateStringsArray,
          ...values: any[]
        ) => {
          calls.push({ type: "reserved", sql: joinSql(strings, values), values: [...values] });
          return makeResult(values);
        };
        reserved.release = async () => {
          calls.push({ type: "release", sql: "release", values: [] });
        };
        return reserved;
      };

      return handler;
    }
  }

  const originalBun = (globalThis as any).Bun;
  const originalSql = originalBun?.sql;
  if (originalBun) {
    originalBun.sql = FakeSql;
  } else {
    (globalThis as any).Bun = { sql: FakeSql };
  }

  return {
    calls,
    restore() {
      if (originalBun) {
        originalBun.sql = originalSql;
      } else {
        delete (globalThis as any).Bun;
      }
    },
  };
}

async function withFakeBun<T>(run: (ctx: { calls: RecordedCall[] }) => Promise<T>) {
  const { calls, restore } = installFakeBun();
  try {
    return await run({ calls });
  } finally {
    restore();
  }
}

describe("Optimized BunPostgresAdapter", () => {
  it("only binds question marks outside literals/comments", async () => {
    await withFakeBun(async ({ calls }) => {
      const adapter = new BunPostgresAdapter(TEST_URL);
      const driver = await adapter.connect();

      const sql = `
        SELECT '? literal' AS literal_value,
               $$dollar ? block$$ AS dollar_block,
               ? AS first_param,
               'Escaped ''?'' literal' AS quoted,
               ? AS second_param
      `;

      await driver.queryRaw({
        sql,
        args: ["alpha", "beta"],
        argTypes: [],
      });

      const queryCall = calls.find(
        (call) => call.type === "connection" && !call.sql.includes("SELECT 1")
      );

      expect(queryCall).toBeTruthy();
      const sqlCall = queryCall!;
      expect(sqlCall.values).toEqual(["alpha", "beta"]);
      expect(sqlCall.sql.includes("'? literal'")).toBe(true);
      expect(sqlCall.sql.includes("dollar ? block")).toBe(true);

      await driver.dispose();
    });
  });

  it("reserves a connection for interactive transactions", async () => {
    await withFakeBun(async ({ calls }) => {
      const adapter = new BunPostgresAdapter(TEST_URL);
      const driver = await adapter.connect();

      const tx = await driver.startTransaction("SERIALIZABLE");
      await tx.queryRaw({
        sql: "SELECT $1::text as label",
        args: ["inside"],
        argTypes: [],
      });
      await tx.executeRaw({
        sql: "UPDATE foo SET bar = $1 WHERE id = $2",
        args: [1, 2],
        argTypes: [],
      });
      await tx.commit();

      const txCalls = calls.filter((call) => call.type === "reserved");
      expect(txCalls.length).toBe(5);
      expect(txCalls[0].sql).toBe("BEGIN");
      expect(txCalls[1].sql.toUpperCase()).toContain("SET TRANSACTION ISOLATION LEVEL");
      expect(txCalls[2].sql).toContain("SELECT __arg0__::text as label");
      expect(txCalls[2].values).toEqual(["inside"]);
      expect(txCalls[3].sql).toBe("UPDATE foo SET bar = __arg0__ WHERE id = __arg1__");
      expect(txCalls[3].values).toEqual([1, 2]);
      expect(txCalls[4].sql).toBe("COMMIT");

      await driver.dispose();
    });
  });
});
