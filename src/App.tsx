import { Rail } from "./components/Rail";
import { Settings } from "./components/Settings";
import { useGateway, type ReadyGateway } from "./hooks/useGateway";
import { rail, shell, stage } from "./ui";

export default function App() {
  const gw = useGateway();

  if (!gw.config || !gw.status) {
    return (
      <div className={shell}>
        <div className="noise" />
        <aside className={rail}>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 flex items-baseline gap-2 text-lg font-bold leading-tight tracking-[-0.03em]">
              Cursor Gateway{" "}
              <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-muted">
                v{__APP_VERSION__}
              </span>
            </h1>
            <p className="m-0 text-[13px] leading-snug text-muted">{gw.t("loading")}</p>
          </div>
        </aside>
        <main className={stage} />
      </div>
    );
  }

  const ready = gw as ReadyGateway;
  return (
    <div className={shell}>
      <div className="noise" />
      <Rail gw={ready} version={__APP_VERSION__} />
      <Settings gw={ready} />
    </div>
  );
}