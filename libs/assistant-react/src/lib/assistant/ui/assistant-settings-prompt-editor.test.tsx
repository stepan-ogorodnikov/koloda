import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantSettingsPromptEditor } from "./assistant-settings-prompt-editor";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

const defaultTemplate = "built-in prompt";
const customDraft = "my custom prompt";

describe("AssistantSettingsPromptEditor", () => {
  it("shows the built-in prompt as read-only in default mode", () => {
    render(
      <AssistantSettingsPromptEditor
        label="System prompt"
        mode="default"
        templateValue={customDraft}
        defaultTemplate={defaultTemplate}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "System prompt" });
    expect(textarea).toHaveProperty("value", defaultTemplate);
    expect(textarea).toHaveProperty("readOnly", true);
    expect(textarea).toHaveProperty("disabled", false);
  });

  it("shows the custom draft as editable in custom mode", () => {
    render(
      <AssistantSettingsPromptEditor
        label="System prompt"
        mode="custom"
        templateValue={customDraft}
        defaultTemplate={defaultTemplate}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "System prompt" });
    expect(textarea).toHaveProperty("value", customDraft);
    expect(textarea).toHaveProperty("readOnly", false);
  });

  it("does not write the built-in prompt into the draft when switching to default", () => {
    const onModeChange = vi.fn();
    const onChange = vi.fn();

    render(
      <AssistantSettingsPromptEditor
        label="System prompt"
        mode="custom"
        templateValue={customDraft}
        defaultTemplate={defaultTemplate}
        onModeChange={onModeChange}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "assistant.settings.system-prompt.mode.default" }));

    expect(onModeChange).toHaveBeenCalledWith("default");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("copies the built-in prompt into an empty draft when switching to custom", () => {
    const onModeChange = vi.fn();
    const onChange = vi.fn();

    render(
      <AssistantSettingsPromptEditor
        label="System prompt"
        mode="default"
        templateValue={null}
        defaultTemplate={defaultTemplate}
        onModeChange={onModeChange}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "assistant.settings.system-prompt.mode.custom" }));

    expect(onChange).toHaveBeenCalledWith(defaultTemplate);
    expect(onModeChange).toHaveBeenCalledWith("custom");
  });
});
