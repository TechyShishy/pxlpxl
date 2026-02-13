# Pxlpxl

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Android Development

### Prerequisites

- [Android Studio](https://developer.android.com/studio) (for the Android SDK and emulators)
- JDK 21 (bundled with Android Studio, or install [Eclipse Temurin](https://adoptium.net/))
- Android SDK API 35 with Build Tools 35.0.0

### Local Development

```bash
# Build web app + sync to native Android project
yarn build:android

# Open in Android Studio
yarn cap:open

# Build & run on a connected device or emulator
yarn cap:run

# Sync only (after web changes)
yarn cap:sync
```

### Release Signing

To produce a signed release build locally:

1. Generate a keystore (one-time):
   ```bash
   keytool -genkey -v -keystore android/pxlpxl-release.keystore \
     -alias pxlpxl -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copy the example properties file and fill in your passwords:
   ```bash
   cp android/key.properties.example android/key.properties
   # Edit android/key.properties with your actual passwords
   ```

3. Build the release AAB:
   ```bash
   cd android && ./gradlew bundleRelease
   ```

> **Note:** `key.properties`, `*.keystore`, and `*.jks` files are gitignored — never commit signing secrets.

### CI/CD (GitHub Actions)

The workflow at `.github/workflows/android.yml` runs automatically:
- **On PRs to `main`:** Builds a debug APK and uploads it as an artifact
- **On push to `main`:** Builds a signed release AAB and uploads it as an artifact

To enable release builds in CI, add these repository secrets:

| Secret | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file (`base64 -w0 pxlpxl-release.keystore`) |
| `ANDROID_KEY_ALIAS` | Key alias (e.g., `pxlpxl`) |
| `ANDROID_KEY_PASSWORD` | Key password |
| `ANDROID_STORE_PASSWORD` | Keystore password |

### App Icons

The `android/app/src/main/res/mipmap-*` directories contain placeholder icons. Replace them with production artwork. You can use [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) to generate all required sizes from a single source image:

```bash
npx @capacitor/assets generate --android
```
