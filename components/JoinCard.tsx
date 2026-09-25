"use client";

import { useState } from "react";
import MountPicker from "./MountPicker";
import { ErrorText, Field, FinePrint, Panel, PanelTitle } from "./ui";
import { useSession } from "@/lib/session";
import type { Profile } from "@/lib/types";

interface JoinCardProps {
  code: string;
  error?: string;
  onSubmit: (profile: Profile) => void;
}

export default function JoinCard({ code, error, onSubmit }: JoinCardProps) {
  const { user } = useSession();
  const [name, setName] = useState("");
  const [color, setColor] = useState("yellow");
  const [problem, setProblem] = useState("");

  function submit(role: Profile["role"]) {
    const trimmed = name.trim();
    if (!trimmed) return setProblem("Pick a name first.");
    setProblem("");
    onSubmit({ name: trimmed, color, role });
  }

  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <Panel className="w-full px-6 py-[22px]">
        <PanelTitle as="h2">Join room {code}</PanelTitle>

        <Field label="Rider name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Cloud" />
        </Field>

        <MountPicker value={color} onChange={setColor} unlocks={user?.unlocks ?? []} />

        {(problem || error) && <ErrorText>{problem || error}</ErrorText>}

        <button className="btn btn-primary btn-block" onClick={() => submit("rider")}>
          Join as a rider
        </button>
        <button className="btn btn-block" onClick={() => submit("host")}>
          Host this room instead
        </button>
        <FinePrint>Riders race. The host starts the race and watches — hosts don&apos;t type.</FinePrint>
      </Panel>
    </main>
  );
}
