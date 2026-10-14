import { BrandTitle } from "./components/BrandTitle";
import { Rail } from "./components/Rail";
import { Settings } from "./components/Settings";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useCursorUpdate } from "./hooks/useCursorUpdate";
import { useGateway, type ReadyGateway } from "./hooks/useGateway";
import { rail, shell, stage } from "./ui";

export default function App() {
  const gw = useGateway();
  const update = useAppUpdate();
  const cursorUpdate = useCursorUpdate(
    gw.status ? (gw.status.cursorVersion ?? "") : undefined,
  );

  if (!gw.config || !gw.status) {
    return (
      <div className={shell}>
        <div className="noise" />
        <aside className={rail}>
          <BrandTitle version={__APP_VERSION__} update={update} t={gw.t} />
          <p className="m-0 text-[11px] leading-snug text-muted">{gw.t("loading")}</p>
        </aside>
        <main className={stage} />
      </div>
    );
  }

  const ready = gw as ReadyGateway;
  return (
    <div className={shell}>
      <div className="noise" />
      <Rail gw={ready} version={__APP_VERSION__} update={update} cursorUpdate={cursorUpdate} />
      <Settings gw={ready} />
    </div>
  );
}