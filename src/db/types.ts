/**
 * Contrato único de acesso a dados usado pelas rotas de API.
 *
 * Duas implementações existem:
 * - `drivers/firestore.ts`: Cloud Firestore (produção / acesso remoto);
 * - `drivers/local.ts`: banco em arquivo local, para desenvolver e testar sem
 *   credenciais do Firebase.
 *
 * Assim as rotas não sabem (nem precisam saber) qual banco está ativo.
 */

export type Row = Record<string, any>;

export type OrderDirection = "asc" | "desc";

export type QueryOptions = {
  /** Filtros de igualdade. `null` casa com valores ausentes/nulos. */
  where?: Row;
  orderBy?: { field: string; direction: OrderDirection }[];
  limit?: number;
};

export type DatabaseInfo = {
  mode: "firestore" | "local";
  label: string;
  projectId: string | null;
  persistent: boolean;
  warning: string | null;
};

export interface Transaction {
  get(collection: string, id: string): Promise<Row | null>;
  /** Busca uma linha por id + filtros adicionais (ex.: perfil). */
  findOne(collection: string, where: Row): Promise<Row | null>;
  list(collection: string, options?: QueryOptions): Promise<Row[]>;
  create(collection: string, values: Row, id?: string): Promise<Row>;
  update(collection: string, id: string, values: Row): Promise<Row | null>;
  /** Apaga e devolve a linha apagada (ou null se não existia). */
  remove(collection: string, id: string): Promise<Row | null>;
}

export interface Database extends Transaction {
  /** Executa `fn` de forma atômica: tudo aplica, ou nada aplica. */
  withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  info(): DatabaseInfo;
}
