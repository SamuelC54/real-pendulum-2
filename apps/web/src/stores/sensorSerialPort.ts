import { atomWithStorage, createJSONStorage } from "jotai/utils";

const sensorSerialPortStorage = createJSONStorage<string>(() => localStorage);

/** Last sensor-board serial port that connected successfully (web UI default). */
export const sensorSerialPortAtom = atomWithStorage<string>(
  "rp-sensor-serial-port",
  "",
  sensorSerialPortStorage,
);
