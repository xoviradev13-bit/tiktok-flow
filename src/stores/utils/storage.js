const isBrowser = typeof window !== "undefined";

const createNoopStorage = () => ({
  getItem(_key) {
    return Promise.resolve(null);
  },
  setItem(_key, value) {
    return Promise.resolve(value);
  },
  removeItem(_key) {
    return Promise.resolve();
  },
});

const createLocalStorageWrapper = () => ({
  getItem(key) {
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
    return Promise.resolve(value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
});

const storage = isBrowser ? createLocalStorageWrapper() : createNoopStorage();

export default storage;