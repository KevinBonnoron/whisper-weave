import type { RecordModel } from '@whisper-weave/shared';
import { logger } from '../lib/logger';
import { pb } from '../lib/pocketbase';
import type { DatabaseRepository } from '../types';

interface DatabaseRepositoryFactoryOptions {
  expand?: string;
}

export function databaseRepositoryFactory<T extends RecordModel>(collectionName: string, { expand }: DatabaseRepositoryFactoryOptions = {}): DatabaseRepository<T> {
  const recordService = pb.collection<T>(collectionName);

  return {
    async getOne(id) {
      return recordService.getOne(id, { expand }).catch((error) => {
        logger.error({ collection: collectionName, id, expand, error: error?.message }, 'Failed to getOne');
        return null;
      });
    },

    async findOne(filter) {
      return recordService.getFirstListItem(filter, { expand }).catch((error) => {
        logger.error({ collection: collectionName, filter, expand, error: error?.message }, 'Failed to findOne');
        return null;
      });
    },

    async findAll(filter?: string) {
      return recordService.getFullList({ ...(filter ? { filter } : {}), sort: '-created', expand }).catch((error) => {
        logger.error({ collection: collectionName, filter, expand, error: error?.message }, 'Failed to findAll');
        return [];
      });
    },

    async getOrCreate(record, filter) {
      const existingRecord = await this.findOne(filter);
      if (existingRecord) {
        return existingRecord;
      }

      return this.create(record);
    },

    async create(record) {
      return recordService.create(record);
    },

    async update(id, record) {
      return recordService.update(id, record);
    },

    async delete(id) {
      return recordService.delete(id);
    },

    async upsert(filter, record) {
      const existing = await recordService.getFirstListItem(filter, { expand }).catch(() => null);
      if (existing) {
        return recordService.update(existing.id, record);
      }

      return recordService.create(record);
    },
  };
}
