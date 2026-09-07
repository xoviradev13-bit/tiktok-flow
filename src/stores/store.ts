import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import { persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from '@/stores/utils/storage';
import interfaceSettingsReducer from "@/stores/slices/interfaceSettings.slice";

const persistInterfaceSettingsConfig = {
  key: 'interfaceSettings',
  storage,
};

const persistedInterfaceSettingsReducer = persistReducer(persistInterfaceSettingsConfig, interfaceSettingsReducer);

export const store = configureStore({
  reducer: {
    interfaceSettings: persistedInterfaceSettingsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

// Export the store and types for use in the application
export default store;
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
