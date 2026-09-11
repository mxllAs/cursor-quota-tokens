# Policy and publishing checklist

This document captures **maintainer-facing** considerations before listing this extension on a marketplace or distributing it widely. It is not legal advice; verify against current terms yourself.

## Cursor (Anysphere)

- **Terms of Service**: Review the latest [Cursor Terms of Service](https://cursor.com/terms) and related policies. This extension reads a session token from local Cursor storage and calls `cursor.com` HTTP APIs that power the web dashboard. Those endpoints are **not documented as a public API** for third-party clients. Anysphere may change storage layout, APIs, or terms at any time.
- **Risk**: The extension may **stop working** after a Cursor update, or may conflict with future policy. Plan for maintenance and user communication.

## Visual Studio Marketplace (Microsoft)

- **Publishing**: Official flow uses `vsce` and a Microsoft publisher account; see [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
- **Publisher agreement**: You must accept the marketplace publisher agreement when registering. Extensions must comply with [marketplace policies](https://aka.ms/vscode-marketplace-policy) (content, security, privacy, etc.).
- **Data and APIs**: Listings that access user credentials or call non-Microsoft services must be described accurately in the extension detail page. Be explicit about **local file/database reads** and **outbound requests** to Cursor domains.

## Open VSX (Eclipse Foundation)

- If you target editors that use [Open VSX](https://open-vsx.org/), read their [publisher agreement](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions) and namespace requirements. Rules differ slightly from the Microsoft marketplace.

## Summary

| Topic | Action |
|--------|--------|
| Cursor ToS / acceptable use | Read current terms; decide if you are comfortable shipping this approach. |
| Marketplace listing | Disclose data access and network behavior; follow publisher and security guidelines. |
| Maintenance | Expect breakage when Cursor changes `state.vscdb` keys or API routes. |

When in doubt, prefer **clear README/SECURITY text** and conservative feature scope over aggressive automation.
