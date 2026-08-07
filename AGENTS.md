# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Native Builds

Do not build the iOS or Android native projects unless the user explicitly requests a native build. Use targeted tests, type checks, formatting checks, and static validation by default.

# React Native Module Source Organization

The rules in this section apply only to `modules/react-native-*/src/**`. They do not apply to application source, `android/`, `ios/`, or generated files under `nitrogen/generated/`.

## Public Boundaries

- Keep `src/index.ts` limited to public exports. Do not place implementations or side effects in the package entry point.
- Treat files that are not exported by `src/index.ts` or declared by `package.json#exports` as internal implementation details.
- Do not import a package's own public entry point from its internal source files. Import the owning source module directly to avoid circular dependencies.
- Preserve existing public import paths unless the user explicitly authorizes a breaking API change.

## Responsibility-Based Directories

Create only directories that contain required files. Do not add empty directories or force small modules into a fixed skeleton.

- `api/`: imperative public APIs and facades.
- `components/`: visual React components.
- `react/`: hooks, providers, contexts, and other React integrations.
- `core/`: platform-independent logic that does not import React, React Native, Expo, native bridges, or the package entry point.
- `native/`: handwritten JavaScript or TypeScript adapters for native bridges.
- `specs/`: Nitro specification files only.
- `fabric/`: Fabric Codegen declarations only.
- `__tests__/`: tests colocated with the responsibility they cover; use `src/__tests__/` only for tests that cross responsibility boundaries.

Do not create broad dumping-ground directories such as `common/`, `misc/`, `helpers/`, or `utils/`. When a file does not justify a new responsibility directory, keep it next to its closest caller.

## File Placement And Naming

- Give each file one primary responsibility. Create a directory only after related files form a meaningful group.
- Name new React components, providers, and error boundaries with `PascalCase.tsx`.
- Name new hooks with `use-*.ts` or `use-*.tsx`.
- Name other new implementation files with `kebab-case.ts` or `kebab-case.tsx`.
- Keep conventional names such as `index.ts`, `types.ts`, and `constants.ts`, and preserve supported platform suffixes such as `.web`, `.native`, `.ios`, and `.android`.
- Prefer sibling files with platform suffixes when implementations differ materially, while retaining a shared import path. Follow the Expo SDK 57 and Metro platform-resolution behavior documented at https://docs.expo.dev/versions/v57.0.0/.
- Keep types beside their owning feature. Move them to top-level `types.ts` or `types/` only when multiple responsibility areas share them.

## Dependency Direction

- Platform and React layers may depend on `core/`; `core/` must not depend on UI, platform adapters, native bridges, generated specifications, or the package entry point.
- Shared code must not import a specific platform implementation directly. Let Metro select the matching platform-suffixed sibling through the shared import path.
- Avoid barrel files for private implementation folders unless the barrel represents a deliberate, stable boundary and does not introduce a dependency cycle.

## Incremental Enforcement

- Apply these rules to new files and to files explicitly being reorganized. Do not migrate an entire existing module as incidental cleanup.
- When modifying existing code, organize only the directly related area and preserve untouched historical naming and layout.
- Before adding a file, state its responsibility and destination directory. Explain any necessary exception in the change summary.
- Add no dependency solely to enforce this organization.

## Validation

- Use only the affected workspace package's existing `test`, `typecheck`, formatting, or static-check scripts.
- Do not start the development environment or run iOS or Android native builds while validating source-organization changes.
