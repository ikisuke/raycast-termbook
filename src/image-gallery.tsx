import {
  Action,
  ActionPanel,
  Grid,
  Icon,
  Toast,
  showToast,
} from "@raycast/api";
import { useRef, useState } from "react";
import { dirname, join } from "node:path";
import { saveEntry, type Entry } from "./dictionary";
import { dictionaryPath } from "./storage";

export function ImageGallery({
  entry,
  onSaved,
}: {
  entry: Entry;
  onSaved: (entries: Entry[]) => void;
}) {
  const [current, setCurrent] = useState(entry);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const path = (name: string) => join(dirname(dictionaryPath), "images", name);
  async function change(name: string, restore: boolean) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const entries = saveEntry(
        dictionaryPath,
        {
          ...current,
          ...(restore
            ? { imagePaths: [path(name)] }
            : { removedImages: [name] }),
        },
        current,
      );
      setCurrent(entries.find((item) => item.id === current.id)!);
      setRemoved((items) =>
        restore ? items.filter((item) => item !== name) : [...items, name],
      );
      onSaved(entries);
      await showToast({
        style: Toast.Style.Success,
        title: restore ? "画像を戻しました" : "この用語から画像を外しました",
      });
    } catch (cause) {
      await showToast({
        style: Toast.Style.Failure,
        title: "画像を変更できませんでした",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Grid
      navigationTitle={`${current.term} — 画像`}
      columns={3}
      isLoading={busy}
      searchBarPlaceholder="画像を選択してEnterで拡大…"
    >
      <Grid.EmptyView title="登録画像はありません" />
      <Grid.Section title="登録済み画像">
        {(current.images ?? []).map((name, index) => (
          <Grid.Item
            key={name}
            id={name}
            title={`画像 ${index + 1}`}
            content={{ source: path(name) }}
            quickLook={{ path: path(name) }}
            actions={
              <ActionPanel>
                <Action.ToggleQuickLook title="拡大表示" />
                <Action.Open title="画像アプリで開く" target={path(name)} />
                <Action
                  title="この用語から画像を外す"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => change(name, false)}
                />
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
      <Grid.Section title="今回外した画像（戻せます）">
        {removed.map((name, index) => (
          <Grid.Item
            key={`removed-${name}`}
            id={`removed-${name}`}
            title={`外した画像 ${index + 1}`}
            content={{ source: path(name) }}
            quickLook={{ path: path(name) }}
            actions={
              <ActionPanel>
                <Action
                  title="この用語に戻す"
                  icon={Icon.Undo}
                  onAction={() => change(name, true)}
                />
                <Action.ToggleQuickLook title="拡大表示" />
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}
