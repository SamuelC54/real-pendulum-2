import { createStore } from "jotai";

/** Single store shared by `<Provider>` and tRPC **`headers()`** (must not use **`getDefaultStore()`** with a bare **`<Provider>`**). */
export const jotaiStore = createStore();
