import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useState } from "react";
import { AskCodex } from "./ask-codex";

export default function Command() {
  const { push } = useNavigation();
  const [error, setError] = useState<string>();
  return (
    <Form
      navigationTitle="Codexに用語を聞く"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Codexに聞く"
            onSubmit={({ term }: { term: string }) => {
              const value = term.trim();
              if (!value || value.length > 200) {
                setError("用語は1〜200文字で入力してください。");
                return;
              }
              push(<AskCodex term={value} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="term"
        title="聞きたい用語"
        placeholder="例：常微分方程式、機械学習のエントロピー"
        error={error}
        onChange={() => setError(undefined)}
        autoFocus
      />
      <Form.Description text="Codexが短い説明・読み・必要なLaTeX数式と解説図を作ります。内容を確認・編集してから辞書に保存できます。問い合わせには通信とCodexの利用枠を使います。" />
    </Form>
  );
}
