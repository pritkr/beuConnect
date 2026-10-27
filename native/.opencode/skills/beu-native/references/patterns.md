# Screen patterns

Copy the shape, then change the data. The source of truth for every rule is
`docs/BUILD_SPEC.md` and `docs/ARCHITECTURE.md`; these are working templates.

## 1. A feature entry file

```tsx
// src/features/thing/index.tsx
import type { RouteDef } from "../../app/router";
import { ThingScreen } from "./screen";

export const thingRoutes: RouteDef[] = [
  {
    name: "thing",
    title: () => "Thing",
    render: (nav) => <ThingScreen nav={nav} />,
  },
];
```

Then spread `thingRoutes` in `src/app/registry.tsx` — that is the only wiring.
A sub-route is `", name: "thing.detail", title: (p) => String(p.code ?? "Thing")`.

## 2. A screen with loading, error and empty

```tsx
export function ThingScreen(props: { nav: Nav }) {
  const [phase, setPhase] = signal<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = signal<Row[]>([]);

  const load = () => {
    setPhase("loading");
    void fetchJson<Payload>(`${SITE}/api/thing`, { cacheKey: "thing" })
      .then((data) => {
        setRows(data.items);
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  };

  effect(() => {
    load();
  });

  return (
    <Screen>
      <Body>
        {() => {
          if (phase() === "loading") return <Loading label="Loading" />;
          if (phase() === "error") return <ErrorState onRetry={load} />;
          if (rows().length === 0) return <EmptyState title="Nothing here yet" />;
          return <Rows rows={rows()} />;
        }}
      </Body>
    </Screen>
  );
}
```

`ErrorState` without `onRetry` is a dead end; give it the same `load`.

## 3. A virtualised list that stays reactive

```tsx
<Screen>
  <ListBar title="Notices" meta={`${rows().length} items`} />
  <View class="flex-1">
    {() => (
      <List
        class="flex-1"
        each={rows()}
        key={(row) => row.id}
        header={() => <FilterBar />}
        empty={() => (
          <View class="flex-1">{() => (loading() ? <Loading /> : <EmptyState title="No notices" />)}</View>
        )}
      >
        {(row) => <NoticeRow row={row()} />}
      </List>
    )}
  </View>
</Screen>
```

- `flex-1` on the `List` is mandatory.
- The `{() => …}` wrapper makes `each` re-read after a fetch or hydration.
- Slot bodies are static; the branching happens in the function they call.

## 4. Hydrate storage once

```tsx
const [profile, setProfile] = signal<Profile | null>(null);

effect(() => {
  void readStore("profile").then((raw) => {
    if (raw) setProfile(JSON.parse(raw) as Profile);
  });
});
```

Keys: `readStore("profile")` writes/reads `beu.profile`; `putCache("result:…", …)`
writes `beu.cache.result:…`. Never call `Storage.getItem` directly from a screen.

## 5. Cached fetch with a last-good copy

```ts
const data = await fetchJson<Thing>(`${SITE}/api/thing`, {
  cacheKey: "thing.v1",
  cacheMaxAge: 10 * 60_000,   // 0 = any age, for saved results/rosters
  revalidate: true,           // serve the copy now, refresh behind the screen
});
```

On failure the last copy is returned if it is younger than `cacheMaxAge`;
otherwise `NetError` reaches the screen, which renders `net.httpMessage(e.status)`.

## 6. A pressable row

```tsx
<Row class="min-h-11 gap-3 rounded-2xl border border-border bg-card px-4 py-3"
     onPress={() => props.nav.push("thing.detail", { code: row.code })}>
  <Col class="flex-1">
    <Text class="text-[15px] font-semibold text-foreground" numberOfLines={1}>{row.name}</Text>
    <Muted class="text-[12px]" numberOfLines={1}>{row.meta}</Muted>
  </Col>
  <Badge tone="mint">{row.count}</Badge>
</Row>
```

`Row` derives the accessibility label from plain-text children; pass `label`
when the row starts with an icon or a nested component.

## 7. A form

```tsx
<Field
  label="Registration number"
  value={reg()}
  onChange={setReg}
  keyboard="number-pad"
  maxLength={11}
  onSubmit={submit}
/>
<Btn onPress={submit} disabled={reg().length !== 11}>Check result</Btn>
```

Disable by intent, not by styling alone; `Btn` handles the press state.

## 8. A stable test handle

Add `testID` to the screen's root (`testID="thing-page"`) and to any control a
test presses. Tests address routes and testIDs first, text last.
