"use client";

import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import persistStore from "redux-persist/es/persistStore";
import store from "@/stores/store";
import { ReactNode } from "react";

const persistor = persistStore(store);

interface ReduxProviderProps {
  children: ReactNode;
}

export const ReduxProvider = ({ children }: ReduxProviderProps) => {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>{children}</PersistGate>
    </Provider>
  );
};
