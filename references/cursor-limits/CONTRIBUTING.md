# Contributing

Thanks for helping improve **Cursor Limits**.

## Scope

- Bug fixes and compatibility updates when Cursor changes `state.vscdb` layout or API routes are especially welcome.
- **Token handling**: Changes that read additional secrets, write tokens to disk, or send data to new hosts need extra scrutiny—open an issue first so we can align on security and [POLICY.md](POLICY.md) implications.

## Development

1. Clone the repository and run `npm install`.
2. Run `npm run compile` (or `npm run watch` during development).
3. Open the folder in **Cursor** or **VS Code** and press **F5** to launch the Extension Development Host.
4. Confirm the status bar updates and tooltips look correct.

## Pull requests

- Keep changes focused; avoid unrelated refactors.
- Mention in the PR if you tested on **macOS**, **Windows**, or **Linux**—this extension uses platform-specific paths and `sqlite3`.

## Publishing

Maintainers package with `npm run vsix` (see [README](README.md)). Marketplace publishing is documented in [POLICY.md](POLICY.md).
