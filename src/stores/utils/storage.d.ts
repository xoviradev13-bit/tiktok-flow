// storage.d.ts
declare module '@/stores/utils/storage' {
  interface Storage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }

  const createWebStorage: (type: 'local' | 'session') => Storage;

  const storage: Storage;
  export default storage;
}
