import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useRef, useState } from "react";
import { readFileSync, statSync } from "node:fs";
import { parseGlossaryCsv } from "./csv";
import {
  importEntries,
  normalize,
  readDictionary,
  type Entry,
  type EntryInput,
} from "./dictionary";
import { plainMarkdown } from "./content";
import { dictionaryPath } from "./storage";

export function CsvImport({
  onSaved,
}: {
  onSaved?: (entries: Entry[]) => void;
}) {
  const { push } = useNavigation();
  async function preview(values: { file: string[]; text: string }) {
    try {
      if (values.file.length && values.text.trim())
        throw new Error(
          "ファイル選択かテキスト貼り付けのどちらかにしてください。",
        );
      if (values.file[0] && statSync(values.file[0]).size > 5 * 1024 * 1024)
        throw new Error("CSVは5MB以下のファイルを選んでください。");
      const text = values.file[0]
        ? readFileSync(values.file[0], "utf8")
        : values.text;
      const rows = parseGlossaryCsv(text);
      const existing = readDictionary(dictionaryPath);
      push(<ImportPreview rows={rows} existing={existing} onSaved={onSaved} />);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "CSVを確認してください",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return (
    <Form
      navigationTitle="CSVを取り込む"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="内容を確認" onSubmit={preview} />
        </ActionPanel>
      }
    >
      <Form.Description text="Glossary形式：ヘッダーなし、1行に「用語,説明」。既存の用語は上書きせずスキップします。" />
      <Form.FilePicker
        id="file"
        title="CSVファイル"
        allowMultipleSelection={false}
        canChooseDirectories={false}
      />
      <Form.TextArea
        id="text"
        title="または貼り付け"
        placeholder="冪等性,読み：べきとうせい／意味：同じ操作を繰り返しても結果が変わらない性質"
      />
    </Form>
  );
}

function ImportPreview({
  rows,
  existing,
  onSaved,
}: {
  rows: EntryInput[];
  existing: Entry[];
  onSaved?: (entries: Entry[]) => void;
}) {
  const names = new Set(existing.map((entry) => normalize(entry.term)));
  const fresh = rows.filter((row) => !names.has(normalize(row.term)));
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState("");
  const saving = useRef(false);
  async function save() {
    if (saving.current || done) return;
    saving.current = true;
    try {
      const result = importEntries(dictionaryPath, rows);
      onSaved?.(result.entries);
      setSummary(
        `${result.added}件追加、${result.skipped}件スキップしました。`,
      );
      setDone(true);
      await showToast({
        style: Toast.Style.Success,
        title: "取り込みました",
        message: `${result.added}件追加、${result.skipped}件スキップ`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "取り込めませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      saving.current = false;
    }
  }
  const markdown = done
    ? `# 取り込み完了\n\n${summary}\n\n戻ると辞書を続けて使えます。`
    : `# CSVの確認\n\n追加予定 **${fresh.length}件**／登録済み **${rows.length - fresh.length}件**（スキップ）\n\n${rows.map((row) => `## ${plainMarkdown(row.term)}${names.has(normalize(row.term)) ? "（スキップ）" : ""}\n\n${plainMarkdown(row.description)}`).join("\n\n")}`;
  return (
    <Detail
      navigationTitle="取り込み内容の確認"
      markdown={markdown}
      actions={
        !done && fresh.length > 0 ? (
          <ActionPanel>
            <Action
              title="新しい用語を追加する"
              icon={Icon.Plus}
              onAction={save}
            />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}

export default function Command() {
  return <CsvImport />;
}
