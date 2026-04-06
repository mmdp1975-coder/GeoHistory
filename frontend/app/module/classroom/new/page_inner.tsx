"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tUI } from "@/lib/i18n/uiLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import ClassroomBasicsForm from "../_components/ClassroomBasicsForm";
import type { ClassroomBasicsInput } from "../types";
import { normalizeClassroomError } from "../utils";

const INITIAL_VALUES: ClassroomBasicsInput = {
  title: "",
  description: "",
  access_mode: "private",
};

export default function NewClassroomPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const {
    checking,
    userId,
    profile,
    error: authError,
    canCreateClassroom,
    languageCode,
  } = useCurrentUser();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(values: ClassroomBasicsInput) {
    if (!profile?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        owner_profile_id: profile.id,
        title: values.title,
        description: values.description || null,
        access_mode: values.access_mode,
      };

      const { error: insertError } = await supabase.from("classrooms").insert(payload);

      if (insertError) throw insertError;
      router.push("/module/classroom");
    } catch (err) {
      setError(normalizeClassroomError(err, languageCode));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-74px)] bg-[linear-gradient(180deg,#f4f7fb_0%,#f8f3e8_100%)]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--geo-navy)]">
              {tUI(languageCode, "classroom.new.title")}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {tUI(languageCode, "classroom.new.subtitle")}
            </p>
          </div>
          <Link
            href="/module/classroom"
            className="rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] shadow-sm hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]"
          >
            {tUI(languageCode, "classroom.new.back")}
          </Link>
        </div>

        <div className="rounded-[28px] border border-[rgba(246,200,106,0.28)] bg-white p-6 shadow-[0_22px_48px_-34px_rgba(16,32,51,0.38)]">
          {checking ? (
            <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.new.loading")}</p>
          ) : authError || !userId ? (
            <StateMessage
              title={tUI(languageCode, "classroom.auth.required.title")}
              message={tUI(languageCode, "classroom.new.auth.message")}
              actionHref="/login"
              actionLabel={tUI(languageCode, "classroom.auth.login")}
            />
          ) : !canCreateClassroom ? (
            <StateMessage
              title={tUI(languageCode, "classroom.new.unavailable.title")}
              message={tUI(languageCode, "classroom.new.unavailable.message")}
            />
          ) : (
            <ClassroomBasicsForm
              initialValues={INITIAL_VALUES}
              submitLabel={tUI(languageCode, "classroom.create")}
              langCode={languageCode}
              submitting={submitting}
              error={error}
              onSubmit={handleCreate}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function StateMessage({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--geo-navy)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {actionHref && actionLabel ? (
        <div className="mt-5">
          <Link
            href={actionHref}
            className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]"
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
