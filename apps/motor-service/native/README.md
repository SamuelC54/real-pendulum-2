# Native build (`teknic_motor.dll`)

CMake builds the Teknic **`teknic_motor`** shared library. **`scripts/build-native.mjs`** (run via **`npm run build:native`** on **`@real-pendulum/motor-service`**) configures **`CMakeLists.txt`** in this directory.

**Visual Studio / CMake:** the script uses **`shell: false`** so **`-G "Visual Studio …"`** is not broken by **`cmd.exe`**. It tries **VS 2022** then **VS 2026** (clears **`build/`** before the second try). Set **`CMAKE_GENERATOR`** in repo **`.env.local`** to pin one generator (see **`cmake -G`** list on your machine).

## Teknic SDK location

- **CMake cache variable** **`TEKNIC_SDK_ROOT`**: default in **`teknic_motor/CMakeLists.txt`** is `C:/Program Files (x86)/Teknic/ClearView/sdk` (override for your install).
- **Override without editing CMake:** set **`TEKNIC_SDK_ROOT`** in the **repository root** **`.env`** or **`.env.local`**, or pass **`-DTEKNIC_SDK_ROOT=...`** when configuring by hand. The build script loads those env files before invoking CMake.
- The SDK must contain **`inc/`** and **`sFoundation Source/sFoundation/win/.../sFoundation20.{lib,dll}`** (see **`teknic_motor/CMakeLists.txt`**).

## Stale build trees

If CMake was ever configured with extra toolchains, delete **`build/`** under this folder and run **`npm run build:native -w @real-pendulum/motor-service`** again. The entire **`build/`** directory is gitignored.
