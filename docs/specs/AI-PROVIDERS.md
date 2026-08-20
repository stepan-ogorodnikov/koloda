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
  A profile can also carry a model allowlist.
- **Secrets** — the credentials stored inside a profile.
  The required fields depend on the provider.
- **Model** — a model available from a provider, identified by a model ID and a display name.
  Models are discovered at runtime, not hard-coded.
- **Model allowlist** — the per-profile restriction on which models are available.
  An unset allowlist allows every model.
  A present array is the allowlist; an empty array allows none.
- **Run input** — the per-request inputs sent through a profile.
  This includes the chosen model and optional model parameters such as reasoning effort.

Relationships:

- A profile belongs to one provider.
- Secrets belong to one profile and are not shared across profiles.
- A run uses one profile at a time.
- The model allowlist narrows which models the picker offers for that profile.
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

In AI settings, each profile is a row with its title (or placeholder), provider display name, a models button, an edit button, and a delete button.
The models button opens the model allowlist dialog for that profile.
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

### Allowlist

A profile can restrict which of its models are available.
The restriction is a list of model IDs stored on the profile.
An unset allowlist allows every catalog model.
A present array is the allowlist; an empty array allows no models.

The user edits the allowlist from AI settings through the models button on the profile row.
The dialog has two modes: all and selected.
In "all" mode every catalog model is available.
In "selected" mode the user checks the models to allow.
Checkboxes are disabled in "all" mode.

The dialog fetches the profile's models when it opens.
Loading and error states are shown, with a retry action on error.
The list can be searched by model name or ID.
An empty result shows an empty state.

Switching from "all" to "selected" restores the previously checked selection.
It does not copy the catalog into the selection.
IDs that were allowed but no longer appear in the catalog stay in the list and stay checked.
The user can deselect them.

Saving in "all" mode clears the stored allowlist.
Saving in "selected" mode stores the checked IDs.
An empty selection stores an empty allowlist, which allows no models.
Allowlist entries are non-empty strings; an empty entry is rejected by validation.

The model picker shows only allowlisted models.
If the allowlist is unset, the picker shows every catalog model.
If the currently selected model is not in the filtered list, it stays visible so a catalog change cannot strand the selection.
A selected model that is not in the catalog at all is shown as a placeholder.

### Reasoning Effort

Some models support a reasoning-effort parameter.
Supported levels and the default come from the model metadata.
The reasoning-effort picker in the conversation UI lists those levels.
If the model has no supported levels, the picker is hidden.

Changing the model resets reasoning effort to that model's default.
A stored reasoning-effort value that does not apply to the newly selected model is ignored.

If a stored model ID is no longer in the provider's list, the first available model is used instead.

## Sending Requests

Chat runs go through the selected profile's secrets.
See the conversation and card-generation specs for run lifecycle, prompts, streaming UI, cancellation, and errors.

Provider-facing details that matter here:

- The request carries the chosen model and any applicable model parameters.
- If the model supports reasoning effort and the user set a level, that level is passed through.
- All providers stream responses.
- An unreachable self-hosted base URL surfaces as a network error on first use.

## Edge Cases

- An unset allowlist means every catalog model is available
- An empty allowlist allows no models; the picker shows an empty list for that profile
- IDs no longer in the catalog stay checked in the settings dialog; the user can deselect them
- Switching to "all" and back to "selected" restores the previous selection
- The currently selected model stays in the picker even when it is not in the catalog or the allowlist
- The allowlist is per profile; changing one profile's allowlist does not affect other profiles
- Saving in "all" mode clears a previously stored allowlist
- The dialog fetches models only while it is open; a failed fetch shows an error with a retry
- The allowlist decides what the picker offers; it does not change how a run is sent
