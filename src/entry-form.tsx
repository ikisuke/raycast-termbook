import {
  environment,
  Action,
  ActionPanel,
  Form,
  Detail,
  Icon,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useRef, useState } from "react";
import {
  isValidReferenceUrl,
  saveEntry,
  type Entry,
  type EntryDraft,
} from "./dictionary";
import { downloadImage } from "./image-url";
import { dirname, join } from "node:path";
import { entryMarkdown, savedImagePaths } from "./content";
import { imageData } from "./media";
import { dictionaryPath } from "./storage";

export function EntryForm({
  entry,
  initialTerm = "",
  initialDraft,
  onSaved,
}: {
  entry?: Entry;
  initialTerm?: string;
  initialDraft?: EntryDraft;
  onSaved?: (entries: Entry[]) => void;
}) {
  const { pop, push } = useNavigation();
  const [imageUrls, setImageUrls] = useState("");
  const downloaded = useRef(new Map<string, string>());
  async function prepareImages(paths: string[] = []) {
    const result = [...paths];
    for (const url of imageUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      let path = downloaded.current.get(url);
      if (!path) {
        path = await downloadImage(
          url,
          join(environment.supportPath, "images"),
        );
        downloaded.current.set(url, path);
      }
      result.push(path);
    }
    return [...new Set(result)];
  }
  const [error, setError] = useState<string>();
  const [urlError, setUrlError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const saving = useRef(false);
  const [draft, setDraft] = useState<EntryDraft>({
    term: entry?.term ?? initialDraft?.term ?? initialTerm,
    reading: entry?.reading ?? initialDraft?.reading ?? "",
    description: entry?.description ?? initialDraft?.description ?? "",
    referenceUrl: entry?.referenceUrl ?? initialDraft?.referenceUrl ?? "",
    formula: entry?.formula ?? initialDraft?.formula ?? "",
    imagePaths: initialDraft?.imagePaths ?? [],
  });
  const [imageError, setImageError] = useState<string>();
  const [previewImages, setPreviewImages] = useState<string[]>(
    initialDraft?.imagePaths ?? [],
  );
  function change<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(values: EntryDraft) {
    if (saving.current || imageError) return;
    if (!values.term.trim()) {
      setError("用語を入力してください");
      return;
    }
    if (!isValidReferenceUrl(values.referenceUrl ?? "")) {
      setUrlError("https:// または http:// で始まるURLを入力してください");
      return;
    }
    saving.current = true;
    setLoading(true);
    try {
      const imagePaths = await prepareImages(values.imagePaths);
      const entries = saveEntry(
        dictionaryPath,
        { ...values, imagePaths },
        entry,
      );
      onSaved?.(entries);
      await showToast({
        style: Toast.Style.Success,
        title: entry ? "更新しました" : "登録しました",
      });
      pop();
    } catch (cause) {
      await showToast({
        style: Toast.Style.Failure,
        title: "保存できませんでした",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      saving.current = false;
      setLoading(false);
    }
  }

  return (
    <Form
      navigationTitle={entry ? "用語を編集" : "用語を追加"}
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="保存する" onSubmit={submit} />
          <Action
            title="プレビュー"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={async () => {
              if (saving.current || imageError) return;
              saving.current = true;
              setLoading(true);
              try {
                const paths = await prepareImages(previewImages);
                push(
                  <Detail
                    navigationTitle="保存前プレビュー"
                    markdown={entryMarkdown(draft, [
                      ...savedImagePaths(
                        dirname(dictionaryPath),
                        entry?.images,
                      ),
                      ...paths,
                    ])}
                  />,
                );
              } catch (cause) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "プレビューできませんでした",
                  message:
                    cause instanceof Error ? cause.message : String(cause),
                });
              } finally {
                saving.current = false;
                setLoading(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      {initialDraft && (
        <Form.Description text="Codexの下書きです。⌘⇧Pで説明・数式・解説図をプレビューできます。不要な図は画像欄から外し、内容を確認・修正して保存してください。" />
      )}
      <Form.TextField
        id="term"
        title="用語"
        placeholder="例：冪等性"
        value={draft.term}
        error={error}
        onChange={(value) => {
          change("term", value);
          setError(undefined);
        }}
        autoFocus
      />
      <Form.TextField
        id="reading"
        title="読み・別名"
        placeholder="べきとうせい、idempotency"
        value={draft.reading}
        onChange={(value) => change("reading", value)}
      />
      <Form.TextArea
        id="description"
        title="説明"
        placeholder="用語だけでも保存できます。説明は後から追記できます。"
        value={draft.description}
        onChange={(value) => change("description", value)}
      />
      <Form.TextField
        id="referenceUrl"
        title="参考URL"
        placeholder="https://example.com/article（任意）"
        value={draft.referenceUrl}
        error={urlError}
        onChange={(value) => {
          change("referenceUrl", value);
          setUrlError(undefined);
        }}
      />
      <Form.TextArea
        id="formula"
        title="数式（LaTeX）"
        placeholder={String.raw`例：\frac{a}{b}、\sum_{i=1}^{n} x_i（任意）`}
        value={draft.formula}
        onChange={(value) => change("formula", value)}
      />
      <Form.FilePicker
        id="imagePaths"
        title="画像を追加"
        allowMultipleSelection
        canChooseDirectories={false}
        canChooseFiles
        value={draft.imagePaths}
        error={imageError}
        onChange={(paths) => {
          change("imagePaths", paths);
          try {
            paths.forEach(imageData);
            setPreviewImages(paths);
            setImageError(undefined);
          } catch (error) {
            setPreviewImages([]);
            setImageError(
              error instanceof Error ? error.message : String(error),
            );
          }
        }}
      />
      <Form.TextArea
        id="imageUrls"
        title="画像URL"
        placeholder="https://example.com/image.svg（1行に1つ）"
        value={imageUrls}
        onChange={setImageUrls}
      />
      <Form.Description
        text={`${entry?.images?.length ? `登録済みの画像${entry.images.length}枚は保持されます。` : ""}PNG / JPEG / GIF / WebP / SVG、1枚20MB以下。画像URLは保存・プレビュー時に取得し、保存後はローカル表示します。⌘⇧Pで数式と画像をプレビューできます。`}
      />
    </Form>
  );
}
