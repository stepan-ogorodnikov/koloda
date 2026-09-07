import type { ZodIssue } from "@koloda/app";
import { Button, Label, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

export type AIProfileSecretsFieldProps = {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  // WHY: Public profiles never return the key; Replace must key off stored presence.
  hasSecrets?: boolean;
  placeholder?: string;
  errors?: ZodIssue[];
};

export function AIProfileSecretsField({
  label,
  value,
  onChange,
  hasSecrets = false,
  placeholder,
  errors,
}: AIProfileSecretsFieldProps) {
  const { _ } = useLingui();
  const [isEditing, setIsEditing] = useState(!value && !hasSecrets);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    inputRef.current?.focus();
  }, [isEditing]);

  const handleStartEditing = () => {
    onChange("");
    setIsEditing(true);
  };

  return (
    <TextField type="password" value={value} onChange={onChange}>
      <Label>{label}</Label>
      {isEditing ? (
        <TextField.Input ref={inputRef} placeholder={placeholder} />
      ) : (
        <Button variants={{ style: "bordered", size: "default" }} onClick={handleStartEditing}>
          {_(msg`settings.ai.profiles.replace`)}
        </Button>
      )}
      {errors && <TextField.Errors errors={errors} />}
    </TextField>
  );
}
