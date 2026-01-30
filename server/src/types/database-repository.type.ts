import type { RecordModel } from '@whisper-weave/shared';

export interface DatabaseRepository<T extends RecordModel> {
  getOne(id: string): Promise<T | null>;
  findOne(filter: string): Promise<T | null>;
  findAll(filter?: string): Promise<T[]>;
  getOrCreate(record: Partial<T>, filter: string): Promise<T>;
  create(record: Partial<T>): Promise<T>;
  update(id: string, record: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  upsert(filter: string, record: Partial<T>): Promise<T>;
}
