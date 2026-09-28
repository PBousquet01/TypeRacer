"use client";

import { useState } from "react";
import MountPicker from "./MountPicker";
import { ErrorText, Field, FinePrint, Panel, PanelTitle } from "./ui";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import type { ErrorCode, Profile } from "@/lib/types";

interface JoinCardProps {
  code: string;
  error?: ErrorCode;
  onSubmit: (profile: Profile) => void;
}

export default function JoinCard({ code, error, onSubmit }: JoinCardProps) {
  const t = useT();
  const { user } = useSession();
  const [name, setName] = useState("");
  const [color, setColor] = useState("yellow");
  const [problem, setProblem] = useState("");

  function submit(role: Profile["role"]) {
    const trimmed = name.trim();
    if (!trimmed) return setProblem(t.home.pickName);
    setProblem("");
    onSubmit({ name: trimmed, color, role });
  }

  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <Panel className="w-full px-6 py-[22px]">
        <PanelTitle as="h2">{t.join.title(code)}</PanelTitle>

        <Field label={t.home.riderName}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Cloud" />
        </Field>

        <MountPicker value={color} onChange={setColor} unlocks={user?.unlocks ?? []} />

        {(problem || error) && <ErrorText>{problem || (error && t.errors[error])}</ErrorText>}

        <button className="btn btn-primary btn-block" onClick={() => submit("rider")}>
          {t.join.asRider}
        </button>
        <button className="btn btn-block" onClick={() => submit("host")}>
          {t.join.hostInstead}
        </button>
        <FinePrint>{t.join.hint}</FinePrint>
      </Panel>
    </main>
  );
}
