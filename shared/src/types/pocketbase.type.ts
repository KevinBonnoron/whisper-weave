export interface RecordModel {
  id: string;
  created: string;
  updated: string;
}

export interface Expand<T> extends RecordModel {
  expand: {
    [K in keyof T]: T[K];
  };
}
