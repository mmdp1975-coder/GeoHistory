"use client";

import { useEffect, useState } from "react";
import { tUI } from "@/lib/i18n/uiLabels";
import type { ClassroomAccessMode, ClassroomBasicsInput } from "../types";
import { classroomAccessModeLabel } from "../utils";

type ClassroomBasicsFormProps = {
  initialValues: ClassroomBasicsInput;
  submitLabel: string;
  langCode?: string | null;
  formId?: string;
  showSubmitButton?: boolean;
  hideTitleField?: boolean;
  hideAccessModeField?: boolean;
  externalTitle?: string;
  onExternalTitleChange?: (value: string) => void;
  externalAccessMode?: ClassroomAccessMode;
  onExternalAccessModeChange?: (value: ClassroomAccessMode) => void;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: ClassroomBasicsInput) => Promise<void> | void;
};

const ACCESS_MODE_OPTIONS: ClassroomAccessMode[] = [
  "private",
  "community",
  "open",
];

export default function ClassroomBasicsForm({
  initialValues,
  submitLabel,
  langCode,
  formId,
  showSubmitButton = true,
  hideTitleField = false,
  hideAccessModeField = false,
  externalTitle,
  onExternalTitleChange,
  externalAccessMode,
  onExternalAccessModeChange,
  submitting = false,
  error,
  onSubmit,
}: ClassroomBasicsFormProps) {
  const [title, setTitle] = useState(initialValues.title);
  const [description, setDescription] = useState(initialValues.description);
  const [accessMode, setAccessMode] = useState<ClassroomAccessMode>(
    initialValues.access_mode
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initialValues.title);
    setDescription(initialValues.description);
    setAccessMode(initialValues.access_mode);
    setValidationError(null);
  }, [initialValues]);

  useEffect(() => {
    if (typeof externalTitle === "string") {
      setTitle(externalTitle);
    }
  }, [externalTitle]);

  useEffect(() => {
    if (externalAccessMode) {
      setAccessMode(externalAccessMode);
    }
  }, [externalAccessMode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = (externalTitle ?? title).trim();
    if (!cleanTitle) {
      setValidationError(tUI(langCode, "classroom.form.validation.title_required"));
      return;
    }
    setValidationError(null);
    await onSubmit({
      title: cleanTitle,
      description: description.trim(),
      access_mode: externalAccessMode ?? accessMode,
    });
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    onExternalTitleChange?.(value);
  }

  function handleAccessModeChange(value: ClassroomAccessMode) {
    setAccessMode(value);
    onExternalAccessModeChange?.(value);
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {!hideTitleField || !hideAccessModeField ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          {!hideTitleField ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--geo-navy)]">
                {tUI(langCode, "classroom.form.title")}
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/55"
                value={externalTitle ?? title}
                onChange={(event) => handleTitleChange(event.target.value)}
                maxLength={160}
                placeholder={tUI(langCode, "classroom.form.title_placeholder")}
                disabled={submitting}
              />
            </div>
          ) : null}

          {!hideAccessModeField ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--geo-navy)]">
                {tUI(langCode, "classroom.form.access_mode")}
              </label>
              <select
                className="w-full rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/55"
                value={externalAccessMode ?? accessMode}
                onChange={(event) =>
                  handleAccessModeChange(event.target.value as ClassroomAccessMode)
                }
                disabled={submitting}
              >
                {ACCESS_MODE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {classroomAccessModeLabel(option, langCode)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <textarea
          className="min-h-[96px] w-full rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/55"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1500}
          placeholder={tUI(langCode, "classroom.form.description_placeholder")}
          disabled={submitting}
        />
      </div>

      {validationError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {validationError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {showSubmitButton ? (
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? tUI(langCode, "classroom.form.saving") : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
