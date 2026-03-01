import type { ZodIssue } from "@koloda/srs";
import { Button, Label, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

export type AIProfileSecretsFieldProps = {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  errors?: ZodIssue[];
};

export function AIProfileSecretsField({ label, value, onChange, placeholder, errors }: AIProfileSecretsFieldProps) {
  const { _ } = useLingui();
  const [isEditing, setIsEditing] = useState(!value);
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
    <TextField
      type="password"
      value={value}
      onChange={onChange}
    >
      <Label>{label}</Label>
      {isEditing ? <TextField.Input ref={inputRef} placeholder={placeholder} /> : (
        <Button
          variants={{ style: "bordered", size: "default" }}
          onClick={handleStartEditing}
        >
          {_(msg`settings.ai.profiles.replace`)}
        </Button>
      )}
      {errors && <TextField.Errors errors={errors} />}
    </TextField>
  );
}
