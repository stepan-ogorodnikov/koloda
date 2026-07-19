# AI Providers

Covers AI providers, profiles, secrets, and model listings.
Does not cover conversation lifecycle, run orchestration, message rendering, card generation UX, or the transport layer.

## What is an AI Provider

An AI provider is an external service or self-hosted server that hosts language models the app can talk to.
The app ships with a fixed set of built-in providers.
Each provider has a display name, an endpoint shape, and a fixed set of secrets it requires.
Users create a profile for a provider, supply credentials, pick a model, and the app sends requests through that profile.

Providers differ in how they authenticate and which models they expose.
The app presents one consistent interface regardless of provider.

## Core Model

- **Provider** — a built-in identifier for an external AI service.
  Each provider has a fixed display name and a fixed shape of secrets.
- **Profile** — a user-named configuration that pairs a provider with the secrets needed to talk to it.
- **Secrets** — the credentials stored inside a profile.
  The required fields depend on the provider.
- **Model** — a model available from a provider, identified by a model ID and a display name.
  Models are discovered at runtime, not hard-coded.
- **Run input** — the per-request inputs sent through a profile.
  This includes the chosen model and optional model parameters such as reasoning effort.

Relationships:

- A profile belongs to one provider.
- Secrets belong to one profile and are not shared across profiles.
- A run uses one profile at a time.
- The model and model parameters for a run are chosen per conversation.
  The request itself goes through the profile's secrets.

## Profiles

A profile is the unit of AI configuration the user manages.

### Adding a Profile

The user opens the add-profile dialog from AI settings.
When there are no profiles add-profile dialog can be opened from assistant chat.
They pick a provider from a dropdown.
The dialog shows the secret fields that provider requires.

On success, the profile is added and the profile list refreshes.
The submit button is disabled while the request is in flight.
A form-level error is shown if the request fails.

### Editing a Profile

The user opens the edit-profile dialog from AI settings.
The dialog is pre-filled with the current title and secrets.

For API-key fields, the stored value is masked behind a replace button.
The user clicks replace to overwrite the key.
The new value is shown as a password field and focused automatically.
The user cannot see the stored key without choosing to replace it.

For base-URL fields, the value is editable as a normal URL input.

On success, the profile is updated and the profile list refreshes.
Editing does not change the profile ID or created-at timestamp.
The provider cannot be changed through edit — to use a different provider, the user creates a new profile.

### Deleting a Profile

Deleting permanently removes the profile and its secrets.
Removing the last profile for a provider does not affect that provider's availability.

### Profile List

In AI settings, each profile is a row with its title (or placeholder), provider display name, edit button, and delete button.
If there are no profiles, AI settings shows an empty-state message.

## Secrets

Secrets are the per-provider credentials stored inside a profile.

### Fields

- **API key** — authenticates with the provider.
- **Base URL** — address of a self-hosted provider endpoint.

A profile must have all required fields filled in before it can be used for a run.
Optional API keys are stored only when provided.

### Validation

Validation runs on the add and edit forms and again when the profile is saved.

The form rejects:

- Empty required fields.
- Fields that contain only whitespace.
- Invalid URLs for the base URL field.

Validation runs on submit.
Failed validation shows an error per field and prevents the request from being sent.

On save, the app also rejects:

- Profiles with no ID.
- Titles longer than the maximum allowed length.
- Required secret fields that are empty or whitespace-only on create.
- Whitespace-only secret fields on store, including partial updates that try to clear a field with whitespace.

Empty optional fields are allowed on save so partial updates do not fail.
If form validation passes but save rejects, the error is shown in the form.

## Models

Each provider exposes a list of models fetched at runtime.

### Fetching

The app fetches models when the user opens the model picker in a conversation, and whenever else the list is needed for that profile.

The list is normalized to a common shape and sorted alphabetically by display name.
Missing metadata is filled with defaults so the picker stays consistent.

If the model list response is malformed, the error is surfaced to the user.

### Reasoning Effort

Some models support a reasoning-effort parameter.
Supported levels and the default come from the model metadata.
The reasoning-effort picker in the conversation UI lists those levels.
If the model has no supported levels, the picker is hidden.

Changing the model resets reasoning effort to that model's default.
A stored reasoning-effort value that does not apply to the newly selected model is ignored.

If a stored model ID is no longer in the provider's list, the first available model is used instead.

## Sending Requests

Chat and card-generation runs go through the selected profile's secrets.
See the conversation and card-generation specs for run lifecycle, prompts, streaming UI, cancellation, and errors.

Provider-facing details that matter here:

- The request carries the chosen model and any applicable model parameters.
- If the model supports reasoning effort and the user set a level, that level is passed through.
- All providers stream responses.
- An unreachable self-hosted base URL surfaces as a network error on first use.
