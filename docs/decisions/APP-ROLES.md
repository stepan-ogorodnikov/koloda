# App Roles

## Ruling

Each app has one role:

| App | Packages | Role |
| --- | --- | --- |
| Desktop | `apps/electron`, `apps/electron-react` | Product |
| Web | `apps/web` | Demo |

- A product app is what users are meant to use.
  Product apps set the feature set.
- A demo app lets people try the product without installing it.
  The web app is published as the live demo.
- A feature is not rejected, cut down, or delayed because a demo app cannot support it.
  It ships in the product apps, and the demo leaves it out.
- When apps differ, the owning spec states what each app without the feature does instead:
  the feature is absent, or shown disabled with a note.
  `docs/specs/AI-PROVIDERS.md` (§Platform availability) is the model.
- Behavior offered in more than one app is the same in each, unless the owning spec names the difference.
- A demo app makes no durability promise.
  Missing export, backup, sync, or multi-tab safety there is not a gap to fix.
- A demo app still has to work.
  The web app is the only public surface, and its Playwright suite gates the deploy (see `agents/VERIFY.md`).
- Each app's README states its role in one line and points here.
- A new app gets its row in the same change that adds it.

## Why

A demo runs where the product cannot reach everything, such as every AI provider or the OS credential store.
Holding the product to those limits would cap it at its weakest app.
The demo exists so people can try the app without installing it.

## Applies when

- Adding an app, or changing what an app is for.
- Proposing, planning, or reviewing a feature that some app cannot support.
- Writing a spec section where the apps differ.
- Auditing a demo app: missing durability features are not findings.

Changes that behave the same in every app do not need this file.
