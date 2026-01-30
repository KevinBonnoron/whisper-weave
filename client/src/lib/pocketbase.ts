import Pocketbase from 'pocketbase';
import { config } from './config';

export const pb = new Pocketbase(config.pocketbase.url);
