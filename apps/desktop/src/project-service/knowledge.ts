import type Database from "better-sqlite3";
import {
  type KnowledgeEntry,
  type KnowledgeSearch,
  knowledgeSearchSchema,
} from "../shared/bridge.ts";

export type { KnowledgeEntry, KnowledgeSearch };
export { knowledgeSearchSchema };

function localDay(at: string | null): string | null {
  if (!at) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export class KnowledgeIndex {
  private readonly db: Database.Database;
  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`create table if not exists decision_index(id text primary key,kind text not null,assumed integer not null,action text,day text,value text not null);
      create virtual table if not exists decisions_fts using fts5(id UNINDEXED,title,text,tokenize='unicode61')`);
  }
  replace(entries: KnowledgeEntry[]): void {
    this.db.transaction(() => {
      this.db.exec("delete from decision_index;delete from decisions_fts");
      const row = this.db.prepare(
          "insert into decision_index values(?,?,?,?,?,?)",
        ),
        search = this.db.prepare("insert into decisions_fts values(?,?,?)");
      for (const entry of entries) {
        row.run(
          entry.id,
          entry.kind,
          entry.assumed ? 1 : 0,
          entry.action,
          localDay(entry.at),
          JSON.stringify(entry),
        );
        search.run(entry.id, entry.title, entry.text);
      }
    })();
  }
  search(raw: KnowledgeSearch): { items: KnowledgeEntry[]; total: number } {
    const input = knowledgeSearchSchema.parse(raw),
      clauses: string[] = [],
      args: (string | number)[] = [];
    const tokens = input.q
        .trim()
        .split(/\s+/)
        .filter((token) => /[\p{L}\p{N}]/u.test(token)),
      query = tokens
        .map((token) => `"${token.replaceAll('"', '""')}"`)
        .join(" AND ");
    if (input.q.trim() && !query) return { items: [], total: 0 };
    if (query) {
      clauses.push("decisions_fts MATCH ?");
      args.push(query);
    }
    if (input.kind === "assumption") clauses.push("d.assumed=1");
    else if (input.kind !== "all") {
      clauses.push("d.kind=?");
      args.push(input.kind);
    }
    if (input.action) {
      clauses.push("d.action=?");
      args.push(input.action);
    }
    if (input.from) {
      clauses.push("d.day>=?");
      args.push(input.from);
    }
    if (input.through) {
      clauses.push("d.day<=?");
      args.push(input.through);
    }
    const from = `from decision_index d ${query ? "join decisions_fts on decisions_fts.id=d.id" : ""} ${clauses.length ? `where ${clauses.join(" AND ")}` : ""}`;
    const total = (
      this.db.prepare(`select count(*) as total ${from}`).get(...args) as {
        total: number;
      }
    ).total;
    const order = query ? "bm25(decisions_fts,0,10,1),d.id" : "d.day desc,d.id";
    const rows = this.db
      .prepare(`select d.value ${from} order by ${order} limit ? offset ?`)
      .all(...args, input.limit, input.offset) as { value: string }[];
    return {
      items: rows.map((row) => JSON.parse(row.value) as KnowledgeEntry),
      total,
    };
  }
}
