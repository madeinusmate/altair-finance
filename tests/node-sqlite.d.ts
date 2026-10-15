declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: Array<string | number | null>): unknown;
      run(...params: Array<string | number | null>): unknown;
    };
    close(): void;
  }
}
