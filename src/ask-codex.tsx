import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { askCodex } from "./codex";
import { EntryForm } from "./entry-form";
import type { Entry, EntryDraft } from "./dictionary";
import { plainMarkdown } from "./content";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeImage, storeImages } from "./media";

export function AskCodex({
  term,
  onSaved,
}: {
  term: string;
  onSaved?: (entries: Entry[]) => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let imageDirectory: string | undefined;
    setError(undefined);
    askCodex(term, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        const { illustrationSvg, ...entry } = value;
        let imagePaths: string[] = [];
        if (illustrationSvg) {
          const image = decodeImage(Buffer.from(illustrationSvg, "utf8"));
          imageDirectory = mkdtempSync(
            join(tmpdir(), "dictionary-illustration-"),
          );
          const directory = imageDirectory;
          imagePaths = storeImages(directory, [image]).map((name) =>
            join(directory, name),
          );
        }
        setDraft({ ...entry, imagePaths });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "生成できませんでした。",
          );
      });
    return () => {
      controller.abort();
      if (imageDirectory)
        rmSync(imageDirectory, { recursive: true, force: true });
    };
  }, [term, attempt]);
  if (draft) return <EntryForm initialDraft={draft} onSaved={onSaved} />;
  return (
    <Detail
      navigationTitle="Codexに聞く"
      isLoading={!error}
      markdown={`# ${plainMarkdown(term)}\n\n${error ? plainMarkdown(error) : "Codexが短い説明・数式・解説図を作成しています。\n\n生成後に内容を編集して保存できます。Escで中止。"}`}
      actions={
        error ? (
          <ActionPanel>
            <Action
              title="もう一度生成する"
              onAction={() => setAttempt((n) => n + 1)}
            />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
