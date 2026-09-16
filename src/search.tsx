import { Action, ActionPanel, Icon, List, Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { readDictionary, searchEntries, type Entry } from "./dictionary";
import { EntryForm } from "./entry-form";
import { dictionaryPath } from "./storage";

import { dirname } from "node:path";
import { entryMarkdown, savedImagePaths } from "./content";
import { ImageGallery } from "./image-gallery";
import { CsvImport } from "./import-csv";
import { AskCodex } from "./ask-codex";

function EntryDetail({
  entry,
  onSaved,
  actions,
}: {
  entry: Entry;
  onSaved: (entries: Entry[]) => void;
  actions: (
    entry: Entry,
    onSaved: (entries: Entry[]) => void,
  ) => Detail.Props["actions"];
}) {
  const [current, setCurrent] = useState(entry);
  function saved(entries: Entry[]) {
    setCurrent(entries.find((item) => item.id === current.id) ?? current);
    onSaved(entries);
  }
  return (
    <Detail
      navigationTitle={current.term}
      markdown={entryMarkdown(
        current,
        savedImagePaths(dirname(dictionaryPath), current.images),
      )}
      actions={actions(current, saved)}
    />
  );
}

export default function Command() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  function reload() {
    try {
      setEntries(readDictionary(dictionaryPath));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);
  const results = error ? [] : searchEntries(entries, query);
  function actions(
    entry?: Entry,
    includeDetail = true,
    onSaved: (entries: Entry[]) => void = setEntries,
  ) {
    return (
      <ActionPanel>
        {entry && includeDetail && (
          <Action.Push
            title="詳細を表示"
            icon={Icon.Eye}
            target={
              <EntryDetail
                entry={entry}
                onSaved={setEntries}
                actions={(current, saved) => actions(current, false, saved)}
              />
            }
          />
        )}
        {entry && (
          <Action.Push
            title="用語を編集"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            target={<EntryForm entry={entry} onSaved={onSaved} />}
          />
        )}
        {!!entry?.images?.length && (
          <Action.Push
            title="画像を拡大・管理"
            icon={Icon.Image}
            shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
            target={<ImageGallery entry={entry} onSaved={onSaved} />}
          />
        )}
        {entry?.referenceUrl && (
          <Action.OpenInBrowser
            title="参考ページを開く"
            url={entry.referenceUrl}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
        )}
        {!error && query.trim() && (
          <Action.Push
            title="Codexに聞いて下書きを作る"
            icon={Icon.Stars}
            shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
            target={<AskCodex term={query.trim()} onSaved={setEntries} />}
          />
        )}
        {!error && (
          <Action.Push
            title={query.trim() ? `「${query.trim()}」を追加` : "用語を追加"}
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={
              <EntryForm initialTerm={query.trim()} onSaved={setEntries} />
            }
          />
        )}
        {entry && (
          <Action.CopyToClipboard
            title="説明をコピー"
            content={entry.description || entry.term}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        )}
        {!error && (
          <Action.Push
            title="CSVを取り込む"
            icon={Icon.Document}
            target={<CsvImport onSaved={setEntries} />}
          />
        )}
        <Action
          title="再読み込み"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={reload}
        />
        <Action.CopyToClipboard
          title="保存先のパスをコピー"
          content={dictionaryPath}
        />
      </ActionPanel>
    );
  }
  return (
    <List
      navigationTitle="自分辞書"
      searchBarPlaceholder="用語、読み、説明を検索…"
      searchText={query}
      onSearchTextChange={setQuery}
      filtering={false}
      isLoading={loading}
      isShowingDetail={results.length > 0}
    >
      <List.EmptyView
        title={
          error
            ? "辞書を読み込めません"
            : query
              ? "見つかりませんでした"
              : "最初の用語を登録しましょう"
        }
        description={
          error ??
          (query
            ? "EnterでCodexに聞く · ⌘Nで自分で追加（Codexへの問い合わせには通信が必要です）"
            : "Enterで用語を追加できます。説明は後からでも大丈夫です。")
        }
        icon={error ? Icon.ExclamationMark : Icon.Book}
        actions={actions()}
      />
      {results.map((entry) => (
        <List.Item
          key={entry.id}
          id={entry.id}
          title={entry.term}
          subtitle={entry.reading}
          icon={Icon.Book}
          detail={
            <List.Item.Detail
              metadata={
                entry.referenceUrl ? (
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Link
                      title="参考URL"
                      text={entry.referenceUrl}
                      target={entry.referenceUrl}
                    />
                  </List.Item.Detail.Metadata>
                ) : undefined
              }
              markdown={[
                entryMarkdown(
                  { ...entry, formula: undefined },
                  savedImagePaths(dirname(dictionaryPath), entry.images),
                ),
                entry.formula?.trim()
                  ? "数式はEnterで詳細を開くと表示されます。"
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n")}
            />
          }
          actions={actions(entry)}
        />
      ))}
    </List>
  );
}
